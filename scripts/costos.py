#!/usr/bin/env python3
"""Coste mensual de WhatsRemisse, con los precios por SKU y las reglas de facturación delante.

Uso:
    python3 scripts/costos.py                      # los números del usuario (20 proveedores, 200 servicios/día)
    python3 scripts/costos.py 1000 20 200 1000 200 # usuarios proveedores servicios/dia postulaciones/dia concluidos/dia

OJO: los precios y las reglas de Google cambian. Antes de dar un número, comprobarlos en la tabla de
SKUs (developers.google.com/maps/billing-and-pricing/sku-details). Reglas que este modelo respeta:

  PLACES (por SESIÓN, no por tecla)
    - Sesión que cierra con Place Details Pro -> las teclas de esa sesión son GRATIS; se paga el cierre.
    - Sesión que cierra con Essentials -> las 12 primeras teclas a $2,83/1.000; el resto gratis.
    - Sesión ABANDONADA (escribió y no eligió) -> TODAS las teclas a $2,83/1.000.
    Por eso bajar el detalle a Essentials suele salir MÁS CARO (pierde la absorción de las teclas).

  RUTAS (dos tarifas, elegidas por HORA desde el 24-09-2026, lib/horasPunta.ts)
    - Horas punta de Lima (L-V 7:00-9:30 y 17:30-20:30; sábado 11:00-13:30) -> TRAFFIC_AWARE (Pro, $10).
    - El resto del día y los domingos -> TRAFFIC_UNAWARE (Essentials, $5, y el doble de tope gratis).
    De las 168 horas de la semana, ~30 h son punta -> ~18 % de las medidas pagan tarifa Pro.

  QUÉ MIDE CADA PANTALLA (leído del código, no supuesto)
    - El PROVEEDOR: 2 campos de dirección por servicio (origen y destino) y la distancia de cada
      postulante cuando abre la lista (1 medida por postulante, caché de 5 min).
    - El CONDUCTOR (su inicio): el VIAJE de cada servicio que ve (origen->destino, caché 30 días por
      teléfono) y la LLEGADA (de él al origen) de los más cercanos. **Esto es lo que hoy se mide en
      CADA teléfono**: el mismo servicio lo miden todos los conductores que lo ven.
"""
import sys

USD_A_SOLES = 3.70

# Gratis por mes y $ por 1.000 llamadas (tramo 10.000-100.000), junio 2026
SKUS = {
    "autocomplete": {"gratis": 10_000, "precio": 2.83},
    "detalle_essentials": {"gratis": 10_000, "precio": 5.00},
    "detalle_pro": {"gratis": 5_000, "precio": 17.00},
    "rutas_essentials": {"gratis": 10_000, "precio": 5.00},
    "rutas_pro": {"gratis": 5_000, "precio": 10.00},
}

VPS_MES = (6.49, 19.49)      # Hostinger KVM 1: promo a largo plazo / tarifa mensual
DOMINIO_MES = 14.40 / 12     # whatsremisse.tech
CAMPOS_POR_SERVICIO = 2      # origen y destino
PLANES = (("1 mes", 50, 1), ("2 meses", 90, 2), ("3 meses", 120, 3))

# ------------------------------------------------------------------ suposiciones del uso
# Están aquí arriba, a la vista, porque son las que deciden el número final.
HORAS_DE_PUNTA_SEMANA = 30.0 / 168.0     # ~18 %: L-V 5,5 h + sábado 2,5 h
DIAS = 30
SERVICIOS_DISTINTOS_POR_CONDUCTOR_MES = 120   # el viaje se paga 1 vez por servicio y teléfono (caché 30 d)
PASES_DEL_INICIO_POR_CONDUCTOR_DIA = 12       # cada vez que cambia su lista se miden los cercanos
CERCANOS_POR_PASE = 5                         # MAXIMO_CANDIDATOS_ETA (hoy 5) dentro de 15 km
APERTURAS_DE_TARJETA_POR_CONDUCTOR_DIA = 15   # escenario con la llegada solo al abrir
POSICIONES_POR_DIA = 4                        # bloques de 500 m con caché de 15 min (escenario C)
FACTOR_DE_REUSO = 0.4                         # cuánto acierta la caché de 5 min en las llegadas
ABANDONOS = 0.30                              # sesiones que se escriben y no se cierran
TECLAS = 6                                    # teclas por búsqueda que SÍ cierra


def costo(llamadas, sku):
    s = SKUS[sku]
    return max(0.0, llamadas - s["gratis"]) * s["precio"] / 1000


def costo_rutas(llamadas):
    """Las rutas se pagan según la hora en que se piden (18 % punta)."""
    return llamadas * (
        (1 - HORAS_DE_PUNTA_SEMANA) * SKUS["rutas_essentials"]["precio"]
        + HORAS_DE_PUNTA_SEMANA * SKUS["rutas_pro"]["precio"]
    ) / 1000


def costo_rutas_todo_pro(llamadas):
    """Comparación: si TODAS las rutas pidieran tráfico real (como antes del 24-09-2026)."""
    return costo(llamadas, "rutas_pro")


def places(servicios):
    """Autocompletado + detalle: lo que cuesta cada servicio publicado."""
    selecciones = servicios * CAMPOS_POR_SERVICIO
    cierre = costo(selecciones, "detalle_pro")           # cierra en Pro -> teclas gratis
    abandonadas = int(selecciones * ABANDONOS / (1 - ABANDONOS))
    c_abandonos = costo(abandonadas * TECLAS, "autocomplete")
    return cierre, c_abandonos, selecciones, abandonadas


def escenario(nombre, usuarios, proveedores, servicios_dia, postulaciones_dia, concluidos_dia, conductores, conductores_activos,
              viaje_en_cada_telefono, viaje_guardado_en_la_base, llegada_solo_al_abrir):
    servicios = servicios_dia * DIAS
    cierre, c_abandonos, selecciones, abandonadas = places(servicios)

    # Rutas del lado del PROVEEDOR: mide la distancia de cada postulante al abrir la lista.
    rutas_proveedor = int(postulaciones_dia * DIAS * 0.7)

    # Rutas del lado del CONDUCTOR.
    if viaje_guardado_en_la_base:
        rutas_viaje = servicios                                   # 1 por servicio, para siempre
    else:
        rutas_viaje = conductores_activos * SERVICIOS_DISTINTOS_POR_CONDUCTOR_MES
    if llegada_solo_al_abrir:
        rutas_llegada = int(conductores_activos * APERTURAS_DE_TARJETA_POR_CONDUCTOR_DIA * DIAS * (1 - FACTOR_DE_REUSO))
    else:
        rutas_llegada = int(
            conductores_activos * PASES_DEL_INICIO_POR_CONDUCTOR_DIA * CERCANOS_POR_PASE * DIAS * (1 - FACTOR_DE_REUSO)
        )
    rutas = rutas_proveedor + rutas_viaje + rutas_llegada

    google = cierre + c_abandonos + costo_rutas(rutas)
    google_sin_punta = cierre + c_abandonos + costo_rutas_todo_pro(rutas)
    fijo = VPS_MES[1] + DOMINIO_MES
    total = fijo + google

    print(f"=== {nombre} ===")
    print(f"  servicios/mes {servicios:>8,} · postulaciones/mes {postulaciones_dia * DIAS:>8,} · concluidos/mes {concluidos_dia * DIAS:>7,}")
    print(f"  PLACES  cierres {selecciones:>8,} -> ${cierre:>8,.2f} · abandonadas {abandonadas * TECLAS:>9,} -> ${c_abandonos:>7,.2f}")
    print(f"  RUTAS   {rutas:>10,} -> ${costo_rutas(rutas):>8,.2f}   (de ellas: proveedor {rutas_proveedor:,} · viaje {rutas_viaje:,} · llegada {rutas_llegada:,})")
    print(f"          si pidieran tráfico real SIEMPRE: ${costo_rutas_todo_pro(rutas):>8,.2f}  (la regla por horas ahorra ${costo_rutas_todo_pro(rutas) - costo_rutas(rutas):,.2f})")
    print(f"  GOOGLE ${google:,.2f} · servidor+dominio ${fijo:,.2f} · TOTAL ${total:,.2f}/mes  (S/ {total * USD_A_SOLES:,.0f})")
    if proveedores:
        print(f"  por PROVEEDOR/premium ({proveedores}): ${total / proveedores:,.2f}  (S/ {total / proveedores * USD_A_SOLES:,.2f})")
    print(f"  por USUARIO ({usuarios}): ${total / usuarios:,.2f}  (S/ {total / usuarios * USD_A_SOLES:,.2f})")
    for plan, precio, meses in PLANES:
        ingreso = precio / meses / USD_A_SOLES
        print(f"    con el plan {plan:8} (S/ {precio}): ingreso ${ingreso:5.2f}/mes -> margen por premium {ingreso - (total / proveedores if proveedores else total):+7.2f} USD")
    print()
    return total


def main(usuarios=1000, proveedores=20, servicios_dia=200, postulaciones_dia=1000, concluidos_dia=200):
    conductores = usuarios - proveedores
    activos = int(conductores * 0.15)      # 15 % de los conductores trabajando cada día
    print(f"Suposiciones (cámbialas en el script si no cuadran):")
    print(f"  conductores {conductores} · activos/día {activos} (15 %) · viajes 1 por servicio y teléfono al mes")
    print(f"  pases del inicio/día {PASES_DEL_INICIO_POR_CONDUCTOR_DIA} · cercanos medidos por pase {CERCANOS_POR_PASE}")
    print(f"  punta: {HORAS_DE_PUNTA_SEMANA:.0%} de la semana · abandonos {ABANDONOS:.0%} · teclas {TECLAS}")
    print()

    a = escenario("A) como está hoy (el viaje se mide en CADA teléfono y la llegada en cada pase)",
                  usuarios, proveedores, servicios_dia, postulaciones_dia, concluidos_dia, conductores, activos,
                  True, False, False)
    b = escenario("B) con el viaje guardado en la base (1 medida por servicio, no por teléfono)",
                  usuarios, proveedores, servicios_dia, postulaciones_dia, concluidos_dia, conductores, activos,
                  False, True, False)
    c = escenario("C) B + la llegada solo cuando el conductor abre la tarjeta",
                  usuarios, proveedores, servicios_dia, postulaciones_dia, concluidos_dia, conductores, activos,
                  False, True, True)
    print("Resumen:")
    print(f"  A ${a:,.0f}/mes  ->  B ${b:,.0f}/mes  ->  C ${c:,.0f}/mes   (por proveedor: ${a/proveedores:,.2f} -> ${c/proveedores:,.2f})")
    print("Antes de proponer el detalle en Essentials: suele salir MÁS CARO (pierde la absorción de las teclas).")


if __name__ == "__main__":
    args = sys.argv[1:]
    numeros = [int(float(x)) for x in args[:5]]
    main(*numeros)
