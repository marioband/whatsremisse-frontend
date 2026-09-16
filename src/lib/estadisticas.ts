import { ServiceAlert } from '../types';

export type Periodo = 'DIARIO' | 'SEMANAL' | 'MENSUAL' | 'ANUAL';
export type RolEstadistica = 'CONDUCTOR' | 'PROVEEDOR';
export type FiltroRol = 'TODOS' | RolEstadistica;

export const PERIODOS: { id: Periodo; etiqueta: string }[] = [
  { id: 'DIARIO', etiqueta: 'Diario' },
  { id: 'SEMANAL', etiqueta: 'Semanal' },
  { id: 'MENSUAL', etiqueta: 'Mensual' },
  { id: 'ANUAL', etiqueta: 'Anual' },
];

export const FILTROS_ROL: { id: FiltroRol; etiqueta: string }[] = [
  { id: 'TODOS', etiqueta: 'Todos' },
  { id: 'CONDUCTOR', etiqueta: 'Como conductor' },
  { id: 'PROVEEDOR', etiqueta: 'Como proveedor' },
];

export interface RangoDePeriodo {
  desde: Date;
  hasta: Date;
  etiqueta: string;
}

const DOS_DIGITOS = (n: number) => String(n).padStart(2, '0');

/** Meses en español, fijos: `toLocaleDateString('es-PE')` devuelve "setiembre". */
const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Lunes como primer día, igual que el calendario de la app. */
export function inicioDeSemana(fecha: Date): Date {
  const copia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const diaSemana = (copia.getDay() + 6) % 7; // 0 = lunes
  copia.setDate(copia.getDate() - diaSemana);
  return copia;
}

/** Fecha del servicio: la programada si existe, si no la de creación. */
export function fechaDelServicio(service: ServiceAlert): Date {
  return new Date(service.scheduled_at || service.created_at);
}

/** Rango y rótulo del período que contiene a `referencia`. */
export function rangoDelPeriodo(periodo: Periodo, referencia: Date): RangoDePeriodo {
  const anio = referencia.getFullYear();
  const mes = referencia.getMonth();

  if (periodo === 'DIARIO') {
    const desde = new Date(anio, mes, referencia.getDate());
    const hasta = new Date(anio, mes, referencia.getDate(), 23, 59, 59, 999);
    return {
      desde,
      hasta,
      etiqueta: `${DOS_DIGITOS(desde.getDate())}/${DOS_DIGITOS(desde.getMonth() + 1)}/${desde.getFullYear()}`,
    };
  }

  if (periodo === 'SEMANAL') {
    const desde = inicioDeSemana(referencia);
    const hasta = new Date(
      desde.getFullYear(),
      desde.getMonth(),
      desde.getDate() + 6,
      23,
      59,
      59,
      999
    );
    return {
      desde,
      hasta,
      etiqueta: `${DOS_DIGITOS(desde.getDate())}/${DOS_DIGITOS(desde.getMonth() + 1)} al ${DOS_DIGITOS(hasta.getDate())}/${DOS_DIGITOS(hasta.getMonth() + 1)}`,
    };
  }

  if (periodo === 'MENSUAL') {
    const desde = new Date(anio, mes, 1);
    const hasta = new Date(anio, mes + 1, 0, 23, 59, 59, 999);
    return { desde, hasta, etiqueta: `${MESES[mes]} ${anio}` };
  }

  const desde = new Date(anio, 0, 1);
  const hasta = new Date(anio, 11, 31, 23, 59, 59, 999);
  return { desde, hasta, etiqueta: String(anio) };
}

/** Mueve la referencia `pasos` períodos (negativo = hacia atrás). */
export function moverPeriodo(periodo: Periodo, referencia: Date, pasos: number): Date {
  if (periodo === 'DIARIO') {
    return new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate() + pasos);
  }
  if (periodo === 'SEMANAL') {
    return new Date(
      referencia.getFullYear(),
      referencia.getMonth(),
      referencia.getDate() + pasos * 7
    );
  }
  if (periodo === 'MENSUAL') {
    // Día 1 para que cambiar de mes no se salte febrero ni los meses de 30 días.
    return new Date(referencia.getFullYear(), referencia.getMonth() + pasos, 1);
  }
  return new Date(referencia.getFullYear() + pasos, referencia.getMonth(), 1);
}

export interface FilaEstadistica {
  id: string;
  fecha: Date;
  rol: RolEstadistica;
  /** Nombre de la contraparte tal como viene en el servicio (puede venir vacío). */
  contraparte: string;
  /** Id de la contraparte, para que la pantalla resuelva su nombre si hace falta. */
  contraparteId: string;
  origen: string;
  destino: string;
  monto: number;
}

/**
 * Una fila por servicio PAGADO Y CERRADO (`pago_estado === 'CONFIRMADO'`) del
 * período, con el rol que tuvo el usuario en ese servicio. Los pendientes de pago
 * no aparecen ni se proyectan, y no hay gráficos: solo la tabla y su total.
 */
export function filasDeEstadistica(params: {
  services: ServiceAlert[];
  userId: string;
  periodo: Periodo;
  referencia: Date;
  filtro: FiltroRol;
}): FilaEstadistica[] {
  const { services, userId, periodo, referencia, filtro } = params;
  const { desde, hasta } = rangoDelPeriodo(periodo, referencia);

  return services
    .filter((service) => service.pago_estado === 'CONFIRMADO')
    .map((service) => {
      const fecha = fechaDelServicio(service);
      const soyProveedor = service.provider_id === userId;
      const rol: RolEstadistica = soyProveedor ? 'PROVEEDOR' : 'CONDUCTOR';
      return {
        id: service.id,
        fecha,
        rol,
        contraparte: soyProveedor
          ? ''
          : service.provider_name || service.company_name || 'Proveedor',
        contraparteId: soyProveedor ? service.assigned_driver_id || '' : service.provider_id,
        origen: service.origin_address || '-',
        destino: service.destination_address || '-',
        monto: Number(service.pago_monto ?? 0),
      };
    })
    .filter((fila) => fila.fecha >= desde && fila.fecha <= hasta)
    .filter((fila) => filtro === 'TODOS' || fila.rol === filtro)
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
}

export function totalDe(filas: FilaEstadistica[]): number {
  return filas.reduce((suma, fila) => suma + fila.monto, 0);
}
