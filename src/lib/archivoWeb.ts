import { Platform } from 'react-native';

/**
 * Elegir un archivo del disco (solo en el navegador) y leerlo como texto.
 *
 * Para qué: cargar la lista de teléfonos de un grupo desde el archivo que Excel guarda como CSV.
 * Por qué así y no con una librería: en la web basta un `<input type="file">` del propio navegador
 * (cero dependencias nuevas), y esto se usa desde la computadora, que es donde está el archivo.
 * En el teléfono (app instalada) no hay selector de archivos del sistema sin añadir una librería
 * nativa: ahí se avisa y se sigue por el otro camino.
 */

/** ¿Se puede abrir el selector de archivos aquí? (navegador, no app instalada) */
export function puedeElegirArchivo(): boolean {
  return Platform.OS === 'web' && typeof document !== 'undefined';
}

export interface ArchivoElegido {
  nombre: string;
  texto: string;
}

/**
 * Abre el selector, lee el archivo elegido y devuelve su texto.
 *
 * Devuelve `null` si el usuario cierra la ventana sin elegir nada (o si estamos en el teléfono).
 * Ojo: el navegador no avisa de «canceló»; se resuelve con `null` cuando la ventana recupera el
 * foco y no hubo ningún archivo, que es el comportamiento que se nota como correcto.
 */
export function elegirArchivoDeTexto(aceptar = '.csv,.txt,text/csv,text/plain'): Promise<ArchivoElegido | null> {
  if (!puedeElegirArchivo()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = aceptar;
    entrada.style.display = 'none';

    let resuelto = false;
    const terminar = (valor: ArchivoElegido | null) => {
      if (resuelto) return;
      resuelto = true;
      window.removeEventListener('focus', alVolverElFoco);
      entrada.remove();
      resolve(valor);
    };

    const alVolverElFoco = () => {
      // Sin archivo y con la ventana de vuelta: se cerró el selector sin elegir.
      window.setTimeout(() => terminar(null), 400);
    };

    entrada.addEventListener('change', () => {
      const archivo = entrada.files && entrada.files[0];
      if (!archivo) {
        terminar(null);
        return;
      }
      const lector = new FileReader();
      lector.onerror = () => terminar(null);
      lector.onload = () => terminar({ nombre: archivo.name, texto: String(lector.result || '') });
      lector.readAsText(archivo, 'utf-8');
    });

    window.addEventListener('focus', alVolverElFoco);
    document.body.appendChild(entrada);
    entrada.click();
  });
}
