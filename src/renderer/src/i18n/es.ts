import type { Catalog } from './types'

/**
 * Spanish message catalog. Must define every `Catalog` key (`satisfies Catalog`).
 * Token placeholders ({role}, {score}, {status}, {time}, {n}) are preserved so the
 * calling component can substitute them.
 */
export const es = {
  // App shell / navigation
  navPool: 'Reserva',
  navChampSelect: 'Selección',
  navSettings: 'Ajustes',

  // Roles
  roleTop: 'Superior',
  roleJungle: 'Jungla',
  roleMiddle: 'Central',
  roleBottom: 'Inferior',
  roleSupport: 'Soporte',

  // Pool Management
  poolTitle: 'Reserva de Campeones',
  poolSubtitle:
    'Marca por rol los campeones que realmente juegas. Las recomendaciones se toman solo de esta reserva.',
  poolChampionLabel: 'Campeón',
  poolChampionPlaceholder: 'Busca un campeón…',
  poolAddButton: 'Añadir',
  poolInactiveChip: 'inactivo',
  poolEmptyRole: 'Aún no hay campeones marcados para {role}.',
  poolRemoveAria: 'Quitar a {champion} de {role}',
  poolRemoveAllAria: 'Quitar a {champion} de todos los roles',

  // Champ Select
  champSelectTitle: 'Selección de Campeón',
  champSelectSubtitle:
    'Mejor elección de tu reserva para el rol activo, ordenada por porcentaje de victorias.',
  champSelectLiveChip: 'En vivo',
  champSelectRoleOverrideLabel: 'Rol (anula la detección automática)',
  champSelectAutoDetect: 'Detección automática',
  champSelectAlliesLockedIn: 'Aliados confirmados',
  champSelectEnemiesRevealed: 'Enemigos revelados',
  champSelectRolePrompt: 'Selecciona tu rol arriba para ver recomendaciones de tu reserva.',
  champSelectEmptyPool:
    'No tienes campeones en tu reserva para {role}. Añade algunos en la pestaña Reserva.',
  champSelectBestPick: 'Mejor Elección',
  champSelectCombinedScore: 'puntuación combinada {score}',
  champSelectOverallWinRate: 'Porcentaje de victorias general',
  champSelectEnemyMatchup: 'Enfrentamiento enemigo',
  champSelectAllySynergy: 'Sinergia aliada',
  champSelectNotAvailable: 'No disponible',
  champSelectInactiveChip: 'inactivo',
  champSelectSummaryOverall: 'General',
  champSelectSummaryEnemy: 'Enemigo',
  champSelectSummaryAlly: 'Aliado',
  champSelectSynergyLive: 'Sinergia: en vivo',
  champSelectSynergyEstimated: 'Sinergia: estimada',
  champSelectInactiveTitle: 'Selección de Campeón Inactiva',
  champSelectInactiveMessage:
    'Inicia una partida de League of Legends para ver recomendaciones de campeones.',

  // Settings
  settingsTitle: 'Ajustes',
  settingsRoleOverrideTitle: 'Anulación de Rol',
  settingsRoleOverrideSubtitle:
    'Fuerza las recomendaciones a un rol específico cuando la detección automática no está disponible (FR-007).',
  settingsClearAutoDetect: 'Borrar (detectar rol automáticamente)',
  settingsFreshnessTitle: 'Actualidad de las Estadísticas',
  settingsFreshnessSubtitle:
    'Cuánto tiempo las estadísticas en caché siguen siendo "actuales" antes de marcarse como obsoletas (research.md §5).',
  settingsFreshnessFieldLabel: 'Umbral de actualidad (horas)',
  settingsSaveButton: 'Guardar',
  settingsLastFetchNever:
    'Aún no se ha completado ninguna descarga de estadísticas en vivo — usando datos incluidos/en caché.',
  settingsLastFetchAt: 'Última descarga {status} el {time}.',
  settingsStatusSuccess: 'correcta',
  settingsStatusError: 'con error',
  settingsStatusUnknown: 'desconocida',
  settingsLanguageTitle: 'Idioma',
  settingsLanguageSubtitle: 'Elige el idioma de la interfaz de la aplicación.',

  // Freshness Indicator
  freshnessLive: 'En vivo',
  freshnessCached: 'En caché',
  freshnessStale: 'Obsoleto',
  freshnessNeverUpdated: 'nunca actualizado',
  freshnessJustNow: 'actualizado ahora mismo',
  freshnessMinutesAgo: 'actualizado hace {n} min',
  freshnessHoursAgo: 'actualizado hace {n} h',
  freshnessDaysAgo: 'actualizado hace {n} d',
  freshnessNoFetch: 'Aún no hay una descarga de estadísticas correcta'
} satisfies Catalog
