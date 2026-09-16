export const COLORS = {
  // Headers y superficies oscuras
  header: '#2D2D2D',
  darkText: '#111111',
  secondaryText: '#555555',
  mutedText: '#888888',

  // Fondos
  background: '#F2F2F2',
  white: '#FFFFFF',
  chatBg: '#FFFFFF',
  inputBg: '#F0F2F5',

  // Tarjetas de servicio
  cardNew: '#FFFFFF',
  cardAppliedOverlay: 'rgba(139, 149, 201, 0.60)',
  // La capa verde de "Servicio Aceptado" es tan translúcida como la azul: el
  // conductor tiene que seguir leyendo los datos del servicio bajo la capa.
  // (Verde nuevo #2E9E5B al 60 % sobre blanco: rgb(130, 197, 157).)
  cardAcceptedOverlay: 'rgba(46, 158, 91, 0.60)',
  // Tinta del rótulo sobre la capa verde translúcida: el blanco sobre el verde
  // al 60 % da 2,2:1 (ilegible), este verde oscuro da 5,4:1.
  cardAcceptedInk: '#17452A',
  cardAccepted: '#2E9E5B',

  // Acentos
  primary: '#3F51B5',
  primaryDark: '#303F9F',
  headerDark: '#2D2D2D',
  brightGreen: '#2E9E5B',
  orange: '#FF9800',

  // Estados / sistema
  danger: '#C2333F',
  warningBg: '#FFF3E0',
  warningText: '#E65100',
  successBg: '#E8F5E9',
  info: '#3F51B5',

  // Mensajes: el que escribe en azul de marca con texto blanco, el otro en gris
  bubbleMine: '#3F51B5',
  bubbleOther: '#C6C6C6',

  // Acciones
  grayAction: '#6B7280',
  blueAction: '#3F51B5',
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 30,
} as const;
