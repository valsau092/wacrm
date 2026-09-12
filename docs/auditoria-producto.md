# Auditoría de producto — wacrm

Este documento es la base para entender, sección por sección, qué tan
personalizable es wacrm hoy sin tocar código, y qué haría falta construir
para atender bien a clientes de rubros distintos (no solo WhatsApp CRM
genérico) desde la misma instancia compartida. Pensado para que alguien
sin contexto previo del proyecto pueda leerlo y entender la sección.

---

## Modelo de tenancy — decisión (2026-09-12)

- **Confirmado**: wacrm ya es multi-tenant funcional, no una promesa del
  schema. 26 tablas tienen columna `account_id` con políticas RLS activas
  (verificado contra la base corriendo, vía `is_account_member(account_id,
  rol)`); las tablas "hijas" sin `account_id` propio (`messages`,
  `pipeline_stages`, `contact_tags`, etc.) se aíslan igual, vía policy que
  hace join a la tabla padre. Cada alta nueva (signup) dispara un trigger
  de Postgres (`handle_new_user()`) que crea automáticamente una cuenta
  (`accounts`) vacía y aislada, con ese usuario como `owner`. Hoy
  `accounts` tiene una sola fila real porque solo se dio de alta una
  persona — no porque el sistema asuma una cuenta por instancia.
- **Gap encontrado**: no existe selector de cuenta para que una misma
  persona/login administre varias cuentas a la vez. Hoy es 1 email = 1
  cuenta (la única forma de moverse de cuenta es una invitación, que migra
  el perfil y borra la cuenta personal vacía de origen).
- **Decisión**: VASA apunta a un modelo de wacrm **compartido** — una sola
  instancia sirviendo a múltiples clientes — en vez de un deploy separado
  por cliente, para poder escalar tanto cuentas high-ticket como
  low-ticket sin que el costo de infraestructura ni el mantenimiento
  crezcan linealmente con la cantidad de clientes.
- **Pendiente de construir** (fuera del alcance de esta auditoría):
  selector de cuenta / tabla de staff con permisos cruzados entre cuentas,
  para que el equipo de VASA pueda operar múltiples cuentas de cliente sin
  logins separados. Se suma al roadmap como ítem propio, antes de la Fase
  6 (Tech Provider).
- **Para clientes high-ticket** que quieran sentir "mi propio sistema":
  subdominio propio (`crm.nombredelcliente.com`) apuntando a la misma
  instancia compartida — mismo patrón de Caddy que ya usamos para
  `crm.vasamkt.com`. No requiere cambios de arquitectura, es routing.

---

## Tanda A — Dashboard, Inbox, Contacts, Pipelines

### Dashboard
**Qué hace**: es la pantalla de inicio — 4 tarjetas de métricas del día
(conversaciones activas, contactos nuevos, valor de negocios abiertos,
mensajes enviados), un gráfico de conversaciones en el tiempo, una torta
de negocios por etapa de pipeline, un gráfico de tiempo de respuesta, y un
feed de actividad reciente. Todo se calcula al vuelo contra la base cada
vez que se abre la pantalla, no hay nada pre-calculado ni cacheado por
cuenta.

**Nivel de customización actual**: nada es editable por un admin. El
layout, qué métricas se muestran, y en qué orden, están hardcodeados
igual para cualquier cuenta. Lo único que varía entre cuentas es el
*dato* (los números salen de las tablas reales de esa cuenta) y la
moneda con la que se formatea el valor de negocios (`accounts.default_currency`,
editable en Settings → Negocios).

**Aislado por cuenta**: sí (confirmado en la sección de tenancy).

**Gap para multi-rubro**: la torta de pipeline (`PipelineDonut`) agrega
**todas** las etapas de **todos** los pipelines de la cuenta en un solo
gráfico — si una cuenta tiene más de un pipeline (ej. "Ventas" y
"Postventa"), hoy no hay forma de elegir cuál mostrar o de separarlos; se
mezclan. Para un rubro que necesite comparar embudos por separado (ej. una
inmobiliaria con "Alquileres" vs "Ventas") esto quedaría confuso sin
tocar código. Tampoco hay forma de ocultar una métrica que no aplique a
un rubro (ej. "valor de negocios" no le sirve a un cliente que solo usa
wacrm como mesa de ayuda, sin pipeline de ventas).

**Notas técnicas**:
- `src/app/(dashboard)/dashboard/page.tsx` — la pantalla.
- `src/lib/dashboard/queries.ts` — `loadMetrics`, `loadPipelineDonut`,
  `loadConversationsSeries`, `loadResponseTime`, `loadActivity`.
  `loadPipelineDonut` no filtra por `pipeline_id`, trae `pipeline_stages`
  de la cuenta entera.
- `src/components/dashboard/*.tsx` — un componente por widget
  (`metric-card`, `pipeline-donut`, `conversations-chart`,
  `response-time-chart`, `activity-feed`, `quick-actions`).

---

### Inbox
**Qué hace**: es la bandeja de conversaciones de WhatsApp — lista de
conversaciones a la izquierda (con filtros por no leídas/pendientes/
asignadas a mí), el hilo de mensajes en el medio con composer de texto,
plantillas aprobadas por Meta, respuestas rápidas, reacciones y adjuntos,
y un panel de datos del contacto a la derecha. Cada conversación se puede
asignar a un agente del equipo y tiene un estado.

**Nivel de customización actual**: editable por un admin sin código:
las **respuestas rápidas** (`quick_replies`, texto libre o mensaje
interactivo) y las **plantillas de WhatsApp** (deben pasar por aprobación
de Meta, no es un editor libre) se administran desde Settings, por
cuenta. También es opcional/configurable el **asistente de IA** para
borradores y auto-respuesta (Settings → Asesor IA), incluyendo a quién
derivar cuando no puede resolver. Hardcodeado igual para cualquier
cuenta: el **estado de una conversación** es un enum fijo de 3 valores
(`open` / `pending` / `closed`) a nivel de constraint de base de datos —
no se pueden agregar ni renombrar estados (ej. una inmobiliaria no puede
tener un estado "Visita agendada" como estado de conversación, tendría
que resolverlo con tags).

**Aislado por cuenta**: sí (confirmado en la sección de tenancy).

**Gap para multi-rubro**: el estado fijo de 3 valores es la limitación
más concreta — cualquier rubro que quiera un flujo de conversación con
más pasos (ej. clínica: "esperando confirmación de turno") hoy tiene que
simular eso con tags o con etapas de pipeline, no con el estado nativo de
la conversación. La asignación automática de conversaciones nuevas (round
robin) no es un ajuste de Inbox — solo existe armando una Automation
(Tier 3, hoy gestionado a medida vía n8n), no hay un toggle self-service
tipo "repartir conversaciones nuevas automáticamente entre el equipo".

**Notas técnicas**:
- `src/app/(dashboard)/inbox/page.tsx` — la pantalla.
- `src/components/inbox/*.tsx` — `conversation-list`, `message-thread`,
  `message-composer`, `template-picker`, `quick-reply-picker`,
  `contact-sidebar`, `message-actions`, `message-reactions`,
  `ai-thread-banner`.
- Tabla `conversations`: `status` tiene un `CHECK` constraint
  (`conversations_status_check`) limitado a `open`/`pending`/`closed`.
  `assigned_agent_id` es la asignación manual a un miembro del equipo.

---

### Contacts
**Qué hace**: la base de contactos — listado con búsqueda y filtro por
tags, ficha de detalle por contacto (datos, notas, negocios asociados,
actividad), e importación masiva desde CSV. Los contactos se pueden
etiquetar y tienen campos personalizados además de los datos básicos.

**Nivel de customización actual**: editable por un admin sin código:
las **tags** (`tags`/`contact_tags`, catálogo libre por cuenta) y los
**campos personalizados** (`custom_fields`) — un admin puede crear
cuantos campos quiera desde Settings o desde el mismo Contacts. Hardcodeado
igual para cualquier cuenta: los campos **fijos** del contacto son
siempre los mismos cuatro (nombre, teléfono, email, empresa) — no se
pueden quitar ni renombrar. Más importante: aunque la tabla `custom_fields`
tiene una columna `field_type` pensada para soportar tipos (texto,
número, fecha, selección), la UI de creación **siempre** manda
`field_type: 'text'` — hoy todo campo personalizado es texto libre, sin
importar qué se necesite.

**Aislado por cuenta**: sí (confirmado en la sección de tenancy).

**Gap para multi-rubro**: este es uno de los gaps más concretos de toda
la auditoría. Una inmobiliaria querría un campo "Tipo de propiedad" como
selección (departamento/casa/local), o una clínica un campo "Fecha de
nacimiento" como fecha real (para poder ordenar/filtrar) — hoy ambos
quedarían forzados a texto libre, sin validación ni orden. Habilitar los
tipos ya previstos en el schema (`field_type`, `field_options`) en la UI
de creación de campos es la mejora de mayor impacto para este punto.

**Notas técnicas**:
- `src/app/(dashboard)/contacts/page.tsx` — la pantalla.
- `src/components/contacts/*.tsx` — `contact-detail-view`, `contact-form`,
  `custom-fields-manager` (panel reusado también en Settings), `import-modal`.
- Tabla `contacts`: columnas fijas `name`/`phone`/`email`/`company`.
- Tabla `custom_fields`: `field_type` default `'text'`, la UI
  (`custom-fields-manager.tsx` línea ~112) nunca manda otro valor.

---

### Pipelines
**Qué hace**: el embudo de ventas — tablero tipo kanban con negocios
(`deals`) moviéndose entre etapas. Un admin puede tener más de un
pipeline en la misma cuenta (ej. uno por línea de negocio), cada uno con
sus propias etapas.

**Nivel de customización actual**: editable por un admin sin código, y
esto es lo más flexible de las 4 secciones de esta tanda: **cantidad de
pipelines** (ilimitados por cuenta), **cantidad y nombre de etapas** por
pipeline, **color** de cada etapa, **orden** (drag & drop), y qué etapa
cuenta como "ganado" y cuál como "perdido" (flags `is_won_stage`/
`is_lost_stage`, con un único ganado y un único perdido por pipeline
forzado a nivel de base). Hardcodeado igual para cualquier cuenta: los
**campos de un negocio** (`deals`) son siempre los mismos — título,
valor, moneda, notas, fecha estimada de cierre, contacto asociado,
responsable. No existe el equivalente a "campo personalizado" para
negocios como sí existe para contactos.

**Aislado por cuenta**: sí (confirmado en la sección de tenancy).

**Gap para multi-rubro**: la falta de campos personalizados en `deals`
es el gap más claro acá. Una inmobiliaria querría campos propios del
negocio (dirección de la propiedad, m², tipo de operación) y no del
contacto; una agencia de viajes querría fecha de viaje, destino. Hoy la
única forma de guardar eso es texto libre en "notas" del negocio, sin
poder filtrar ni reportar por ese dato. El modelo de pipelines/etapas en
sí ya es lo bastante genérico como para servir a cualquier rubro sin
tocar código — el límite está en qué datos puede llevar un negocio, no en
la forma del embudo.

**Notas técnicas**:
- `src/app/(dashboard)/pipelines/page.tsx` — la pantalla.
- `src/components/pipelines/*.tsx` — `pipeline-board` (kanban),
  `deal-card`, `deal-form`, `pipeline-settings` (alta/edición de
  pipelines y etapas), `pipeline-analytics`.
- Tabla `pipeline_stages`: `is_won_stage`/`is_lost_stage` con índices
  `UNIQUE ... WHERE is_won_stage` / `WHERE is_lost_stage` (uno solo de
  cada por pipeline, a nivel de constraint).
- Tabla `deals`: sin mecanismo de campos personalizados propio; `currency`
  es por-negocio (puede diferir del `default_currency` de la cuenta).

---

## Tanda B — Settings (por clusters) + el concepto de accounts/roles

Nota de arquitectura antes de entrar: `/settings` es una sola pantalla con
un riel de navegación lateral (`SettingsRail`) y un panel que cambia según
`?tab=` en la URL (`src/app/(dashboard)/settings/page.tsx`). El riel
agrupa las secciones bajo dos encabezados visuales, "Cuenta" y "Workspace"
(`Settings.groups` — son solo 2 títulos de agrupación, no una feature de
permisos ni de equipos). Todo lo de Settings requiere rol `admin` o
superior para siquiera entrar a la pantalla (`minRole: "admin"` en el
sidebar).

### Cuenta y equipo (overview, members, invite, roles)
**Qué hace**: la pantalla de aterrizaje de Settings (resumen con estado
de WhatsApp, cantidad de miembros, plantillas pendientes, tags/campos) y
la gestión de equipo — invitar gente por link (no por email, se comparte
el link a mano por WhatsApp o el canal que sea), ver quién es miembro,
sacar gente, y qué rol tiene cada uno.

**Nivel de customización actual**: editable por un admin sin código: a
quién invitar y con qué rol, revocar invitaciones, sacar miembros,
cambiar el rol de alguien. Hardcodeado igual para cualquier cuenta: los
**4 roles** (`owner`/`admin`/`agent`/`viewer`) son fijos, con un set fijo
de 6 capacidades por rol (ver más abajo, sección de accounts/roles) — no
se pueden crear roles nuevos ni permisos más finos (ej. "puede ver
Pipelines pero no Inbox" no existe como combinación posible).

**Aislado por cuenta**: sí — los miembros, invitaciones y roles son
siempre relativos a una sola cuenta (`account_id`).

**Gap para multi-rubro**: no es tanto un gap de rubro como de tamaño de
equipo: cuentas con equipos grandes y estructuras más departamentales
(ej. una clínica con recepción / médicos / administración con permisos
distintos entre sí) hoy tienen que forzar todo el mundo dentro de 4
roles genéricos. No hay "grupos" o "departamentos" reales — el nombre
`groups` en la traducción es engañoso, es solo un rótulo visual del riel.

**Notas técnicas**:
- `src/components/settings/settings-overview.tsx`, `members-tab.tsx`.
- Invitaciones: RPCs `redeem_invitation`/`peek_invitation` (Postgres),
  tabla `account_invitations` — el link no expone email, expira por
  tiempo (1/7/30 días), y al aceptarse borra la cuenta personal vacía
  del invitado (ver sección de tenancy).
- Roles: `src/lib/auth/roles.ts` — jerarquía plana
  `owner(4) > admin(3) > agent(2) > viewer(1)`, ver detalle en la
  sección de accounts/roles más abajo.

---

### Integraciones (whatsapp, apiKeys, deals)
**Qué hace**: conectar el número de WhatsApp Business (credenciales de
Meta), generar API keys para integrarse con sistemas externos (ej. n8n,
Zapier), y configurar moneda por defecto para los negocios del pipeline.

**Nivel de customización actual**: editable por un admin sin código: las
credenciales de WhatsApp (Phone Number ID, WABA ID, token, PIN), crear/
revocar API keys con **scopes elegibles al crearlas** (esto sí está bien
resuelto — a diferencia de los campos personalizados de Contacts, acá el
selector de permisos por key ya existe en la UI), y la moneda por
defecto de la cuenta. Hardcodeado igual para cualquier cuenta: **un solo
número de WhatsApp por cuenta** — la tabla tiene un `UNIQUE(account_id)`
a nivel de base, no es una limitación de UI que se pueda destrabar sin
tocar schema.

**Aislado por cuenta**: sí.

**Gap para multi-rubro**: el límite de un solo número de WhatsApp por
cuenta es el más concreto de este cluster. Cualquier cliente que quiera
separar líneas (ej. "Ventas" y "Soporte" en dos números, o una clínica
con un número por sede) no puede hacerlo hoy dentro de una misma cuenta
— necesitaría una cuenta wacrm por número, lo cual rompe la idea de
"un cliente, una cuenta" y complica reporting/pipeline unificado.

**Notas técnicas**:
- `src/components/settings/whatsapp-config.tsx`, `api-keys-settings.tsx`,
  `deals-settings.tsx`.
- Tabla `whatsapp_config`: `UNIQUE(account_id)` **y**
  `UNIQUE(phone_number_id)` — ni una cuenta puede tener 2 números, ni un
  mismo número puede repartirse entre 2 cuentas de la instancia.
- Tabla `api_keys`: columna `scopes text[]`, con picker de checkboxes ya
  wireado en `api-keys-settings.tsx`.

---

### Plantillas y campos (templates, tagsAndFields)
**Qué hace**: administrar las plantillas de mensajes de WhatsApp (las
que hacen falta para reabrir una conversación pasadas 24hs, o para
Broadcasts) y el catálogo de tags + campos personalizados de contactos
(el mismo panel que ya se documentó en la sección de Contacts de la
Tanda A).

**Nivel de customización actual**: editable por un admin sin código:
alta de plantillas nuevas (texto, variables, botones), tags libres, y
campos personalizados (siempre como texto — ver el gap ya anotado en
Contacts). Hardcodeado / limitado por fuera de wacrm: una plantilla
nueva **tiene que aprobarla Meta** antes de poder usarse — no es un
límite de wacrm, es una regla de la API de WhatsApp, pero vale aclararlo
porque un cliente nuevo va a preguntar "¿por qué no puedo mandar esto
ya?".

**Aislado por cuenta**: sí.

**Gap para multi-rubro**: ninguno nuevo — es el mismo gap de tipos de
campo personalizado ya documentado en Contacts (Tanda A). La única
particularidad de rubro acá es el **contenido** de las plantillas en sí
(un rubro necesita plantillas de recordatorio de turno, otro de
seguimiento de pedido) — eso no es una limitación de producto, es trabajo
de configuración por cuenta que ya está soportado.

**Notas técnicas**:
- `src/components/settings/template-manager.tsx`,
  `fields-and-tags-panel.tsx`.
- Las plantillas dependen de `src/lib/whatsapp/meta-api.ts` para
  sincronizar el estado de aprobación contra Meta.

---

### Personal (profile, appearance, security, quickReplies)
**Qué hace**: ajustes que son del **usuario**, no de la cuenta —
foto y nombre de perfil, cambio de contraseña, cerrar sesión en todos
lados, modo claro/oscuro y color de acento. Las respuestas rápidas
también viven acá aunque son a nivel de cuenta (compartidas por todo el
equipo, no por-usuario), es una decisión de organización del menú más
que de dato.

**Nivel de customización actual**: todo lo de este cluster ya es
self-service para cualquier usuario (no requiere admin, salvo
respuestas rápidas que si son de cuenta). Los 5 temas de color
(`Navy`/`Emerald`/`Cobalt`/`Amber`/`Rose`, en `src/lib/themes.ts`) son
una lista fija de paletas — no hay editor de color libre ni forma de
subir un tema de marca propio (ej. que un cliente use su color
corporativo exacto). **Decisión ya tomada en la fase de i18n**: los
*nombres* de los temas quedan en inglés a propósito, no es un pendiente.
La posibilidad de un tema custom por marca es un tema distinto (de
producto, no de idioma) y queda abierto acá.

**Aislado por cuenta**: parcialmente — perfil/seguridad/apariencia son
por-usuario (ni siquiera por-cuenta, son de la persona); quick replies sí
son de cuenta.

**Gap para multi-rubro**: no es un gap de rubro, es un gap de marca —
si un cliente high-ticket quiere que el CRM "se sienta suyo" más allá
del subdominio (ver decisión de tenancy), hoy el techo es elegir entre 5
paletas fijas, no un color propio.

**Notas técnicas**:
- `src/components/settings/profile-form.tsx`, `security-panel.tsx`,
  `appearance-panel.tsx`, `quick-replies-manager.tsx`.
- `src/lib/themes.ts` — paletas hardcodeadas, `MODES`/`THEMES` fijos.

---

### Asesor IA (aiConfig, aiKnowledge)
**Qué hace**: configurar el asistente de IA que redacta respuestas
sugeridas y puede auto-responder mensajes entrantes, con una base de
conocimiento (documentos/FAQs) que el asistente consulta antes de
contestar.

**Aclaración importante de arquitectura**: a pesar de que en la
traducción vive bajo el namespace `Settings.aiConfig`/`Settings.aiKnowledge`,
**esto no es una pestaña de `/settings`** — el componente
(`src/components/settings/ai-config.tsx`) se monta desde
`/agents` (pestaña "Setup" de la sección Agents), una ruta que hoy **no
está en el sidebar para nadie** (ni siquiera para el owner — ver nota
técnica de Tanda C). En la práctica, hoy solo se llega a esta pantalla
sabiendo la URL de memoria.

**Nivel de customización actual**: editable sin código (una vez que se
entra a `/agents`): proveedor de IA (OpenAI o Anthropic) y su propia API
key, modelo, prompt de comportamiento/contexto de negocio, activar/
desactivar auto-respuesta, tope de auto-respuestas por conversación
antes de derivar a un humano, y a quién derivar. La base de conocimiento
admite documentos de texto libre, con búsqueda semántica opcional (si se
carga una key de embeddings) o por palabra clave si no.

**Aislado por cuenta**: sí — cada cuenta trae su propia key de proveedor
de IA, su propio prompt y su propia base de conocimiento.

**Gap para multi-rubro**: el prompt de "contexto de negocio" es 100%
texto libre, así que el rubro en sí no es una limitación (cada cuenta
describe su propio negocio ahí). El gap real es de **descubribilidad**:
al no estar en el sidebar, activar el asistente de IA hoy depende de que
alguien de VASA lo configure a mano por cuenta — no es self-service en
la práctica, aunque técnicamente la UI ya existe y funciona.

**Notas técnicas**:
- `src/components/settings/ai-config.tsx`, montado desde
  `src/app/(dashboard)/agents/page.tsx`.
- Tablas `ai_configs`, `ai_knowledge_documents`, `ai_knowledge_chunks`,
  `ai_usage_log` — todas con `account_id`.

---

### El concepto de accounts/roles (transversal a todo Settings)
**Qué hace**: es el modelo de permisos que sostiene toda la aplicación,
no una pantalla en sí. Cada usuario pertenece a exactamente una cuenta
(`profiles.account_id`) con un rol (`profiles.account_role`), y ese par
(cuenta, rol) es lo que decide qué ve y qué puede tocar en absolutamente
todas las secciones.

**Nivel de customización actual**: nada de esto es editable por un
admin — es el código base de la aplicación. Los 4 roles son fijos, y
las 6 capacidades que existen hoy son fijas y binarias:
`canManageMembers`, `canEditSettings`, `canSendMessages`, `canViewOnly`,
`canDeleteAccount`, `canTransferOwnership` (todas definidas en un único
archivo, `src/lib/auth/roles.ts`, reusado tanto en guards de API como en
policies de RLS vía `is_account_member`). No existen permisos por
sección (ej. "puede administrar Pipelines pero no Broadcasts") ni roles
custom por cuenta.

**Aislado por cuenta**: sí, por definición — el rol de un usuario es
siempre relativo a la cuenta a la que pertenece hoy.

**Gap para multi-rubro**: no es un gap de rubro sino el mismo gap
mencionado en el cluster "Cuenta y equipo" — organizaciones más grandes
o departamentalizadas van a pedir permisos más finos que estos 4 roles
genéricos. Vale la pena tenerlo anotado como un ítem de plataforma (no
de un rubro puntual) para cuando se evalúe el roadmap de multi-cuenta
por staff (ver decisión de tenancy, arriba).

**Notas técnicas**:
- `src/lib/auth/roles.ts` — jerarquía y predicados de capacidad.
- `is_account_member(account_id, min_role)` — función de Postgres que
  espeja la misma jerarquía para RLS.
- `account_role_enum` — tipo de Postgres: `owner`, `admin`, `agent`,
  `viewer`.

---

## Tanda C — Broadcasts, Automations, Flows, Agents

**Hallazgo principal, antes de entrar sección por sección**: revisé cómo
se conectan hoy estas 4 secciones con n8n, y la respuesta honesta es que
**hoy no se conectan** — son dos sistemas corriendo en paralelo, no
integrados entre sí. Evidencia concreta:

- Las 4 tablas de este cluster están **vacías en la instancia real**
  (`broadcasts`, `automations`, `flows`, `ai_configs`, `webhook_endpoints`,
  `api_keys` — 0 filas cada una). Nunca se usó ninguna desde que existe
  esta cuenta.
- Miré los workflows reales de n8n que ya corren para clientes de VASA
  (ej. "Óptica — Meta Cloud API", "Whatsapp HP STORE Ventas Multi",
  bots de GoFix) — son bots **construidos enteramente en n8n**: reciben
  el webhook de Meta Cloud API directo (no pasan por wacrm), tienen su
  propia lógica de buffer/lock de mensajes en Postgres, su propio AI
  Agent (LangChain + OpenAI) y su propia forma de registrar leads. Busqué
  en la definición de **todos** los workflows guardados alguna mención a
  `wacrm`, `vasamkt` o al path `/api/v1/` (el prefijo de la API pública
  de wacrm) — no aparece en ninguno.
- A nivel de infraestructura, n8n y Supabase corren en redes Docker
  distintas (`n8n-prod_default` vs `supabase_default`), así que ni
  siquiera comparten red interna — si se conectaran, sería por los
  puertos publicados al host (Postgres del pooler en 5432/6543, o el
  gateway de la API en 8000), no por una integración ya armada.

Conclusión: para los 4 rubros de esta tanda, el foco no es "cómo se
conectan" (todavía no hay conexión), sino **qué mecanismo ya existe en
el código, listo para usarse el día que se decida integrar** en vez de
seguir con bots 100% aparte. Eso es lo que documento en cada sección.

### Broadcasts
**Qué hace**: envío de campañas masivas de WhatsApp con plantillas
aprobadas, a una audiencia elegida por tags, campo personalizado o CSV
subido a mano (ver Tanda A/B para el detalle de UI — acá el foco es
integración).

**Visible en el producto**: sí — está en el sidebar (`/broadcasts`,
visible desde `admin` para arriba) y en la lista de rutas protegidas del
middleware. Es la única de las 4 secciones de esta tanda que un cliente
podría llegar a usar sin que nadie de VASA le pase un link.

**Mecanismo de conexión disponible (no confirmado en uso)**:
`POST /api/v1/broadcasts` (scope `broadcasts:send`) — un n8n externo
podría lanzar una campaña completa (hasta 1000 destinatarios por
llamada) sin tocar la UI, y consultar `GET /api/v1/broadcasts/{id}`
para el progreso. Es el endpoint más completo de la API pública hoy.

**Notas técnicas**:
- `src/app/api/v1/broadcasts/route.ts` (asumido por convención del
  resto de `/api/v1`), documentado en `docs/public-api.md`.
- Tabla `broadcasts` + `broadcast_recipients`, 0 filas en la instancia
  actual.

---

### Automations
**Qué hace**: reglas tipo "cuando pasa X, hacer Y" sobre eventos de
WhatsApp — nuevo mensaje, palabra clave, contacto nuevo, etc. — con
pasos como enviar mensaje, agregar tag, crear negocio o pegarle a un
webhook externo.

**Visible en el producto**: sí — mismo caso que Broadcasts: en el
sidebar (`admin`+) y en las rutas protegidas del middleware.

**Mecanismo de conexión disponible (no confirmado en uso)**: acá está
la pieza más directa para conectar con n8n — el paso `send_webhook`
(`src/lib/automations/engine.ts` línea ~587) hace un `POST` saliente a
cualquier URL `https`, con headers y body armables con variables del
contexto (`{{ contact.id }}`, etc.), protegido contra SSRF (no sigue
redirects, rechaza IPs privadas/loopback, timeout de 10s). Si mañana se
arma una Automation con ese paso apuntando a un webhook de n8n, wacrm
podría disparar workflows de n8n en tiempo real por cada evento — hoy
esto está construido pero sin ninguna Automation creada que lo use.

**Notas técnicas**:
- `src/lib/automations/engine.ts` — motor de ejecución de pasos.
- `src/components/automations/automation-builder.tsx` — editor visual.
- Tablas `automations`, `automation_steps`, `automation_logs`,
  `automation_pending_executions` — 0 filas.

---

### Flows
**Qué hace**: constructor de conversaciones con botones/listas tipo
árbol de decisión (menú de bienvenida, FAQ, derivación) — más visual
que Automations, pensado para flujos de varios pasos con el cliente.

**Visible en el producto**: **no** — a diferencia de Broadcasts y
Automations, `/flows` **no está** en el arreglo `navItems` del sidebar
(`src/components/layout/sidebar.tsx`) para ningún rol, ni siquiera
`owner`, y tampoco figura en `protectedPaths` del middleware
(`src/middleware.ts`). Hoy se llega únicamente escribiendo la URL a
mano — no es una restricción de rol, es que nunca se enlazó desde
ningún lado de la navegación.

**Mecanismo de conexión disponible**: ninguno hoy. A diferencia de
Automations, los tipos de nodo de Flows (`start`, `send_message`,
`send_buttons`, `send_list`, `send_media`, `collect_input`, `condition`,
`set_tag`, `handoff`, `end`) **no incluyen un nodo de webhook** — no hay
forma de que un Flow le pegue a n8n a mitad de conversación. Tampoco
está contemplado en el roadmap de la API pública (`docs/public-api.md`
lo lista explícitamente como "not yet scheduled").

**Notas técnicas**:
- `src/app/(dashboard)/flows/page.tsx`, `src/components/flows/*.tsx`.
- Tablas `flows`, `flow_nodes`, `flow_runs`, `flow_run_events` — 0 filas.

---

### Agents
**Qué hace**: el asistente de IA propio de la cuenta (borradores +
auto-respuesta) y su base de conocimiento — es la sección que en la
Tanda B documenté como "Asesor IA" dentro de Settings, pero
arquitectónicamente vive en su propia ruta.

**Visible en el producto**: **no**, mismo caso que Flows — `/agents`
no está en `navItems` ni en `protectedPaths`. Ni el owner tiene un link
a esta pantalla hoy.

**Mecanismo de conexión disponible**: ninguno directo con n8n. El
asistente llama al proveedor de IA (OpenAI/Anthropic) directamente con
la key que carga la propia cuenta — no hay un paso intermedio por n8n,
ni un webhook de salida propio de Agents. Si se quisiera que el bot de
n8n de un cliente (como los que ya corren hoy) usara la base de
conocimiento cargada acá, hoy no hay ningún endpoint público para leerla
— habría que agregarlo.

**Notas técnicas**:
- `src/app/(dashboard)/agents/page.tsx`.
- `src/components/agents/ai-playground.tsx`, `ai-usage.tsx`,
  `src/components/settings/ai-config.tsx` (el formulario de setup, pese
  al nombre del archivo/carpeta).
- Tablas `ai_configs`, `ai_knowledge_documents`, `ai_knowledge_chunks`,
  `ai_usage_log` — 0 filas.

---

### Resumen de la Tanda C para el roadmap

| Sección     | En el sidebar | En rutas protegidas | Filas hoy | Gancho para n8n ya construido |
|-------------|:---:|:---:|:---:|---|
| Broadcasts  | Sí (admin+) | Sí | 0 | `POST /api/v1/broadcasts` |
| Automations | Sí (admin+) | Sí | 0 | paso `send_webhook` |
| Flows       | No | No | 0 | Ninguno |
| Agents      | No | No | 0 | Ninguno |

La decisión pendiente no es de UI ni de traducción — es de **producto**:
¿wacrm reemplaza a los bots de n8n hechos a medida (llevando esa lógica
a Automations/Flows nativos, con más trabajo de desarrollo pero
self-service para el cliente), o sigue siendo un CRM "de humanos" que
convive con bots de n8n aparte para cada cliente (como es hoy en la
práctica)? Esa definición condiciona si vale la pena seguir invirtiendo
en Automations/Flows/Agents como feature de producto, o dejarlos como
están y enfocar los videos instructivos solo en lo que un cliente
realmente usa (Dashboard, Inbox, Contacts, Pipelines, y las partes de
Settings de la Tanda B).

---

### Pregunta abierta — Broadcasts/Automations/Flows/Agents desconectadas de n8n

Las 4 tablas (`broadcasts`, `automations`, `flows`, `ai_configs`) tienen
0 filas reales y ningún workflow de n8n (GoFix, HP Store) las lee ni
escribe — esos workflows corren 100% independientes con su propio
webhook de Meta Cloud API. La diferencia entre ellas es de visibilidad,
no de conexión:

- Broadcasts y Automations **sí** están en el sidebar (admin+), pero sin
  uso real detrás — el usuario puede navegar a ellas pero no logran
  nada.
- Flows y Agents son además rutas huérfanas: no aparecen en ningún nav,
  ni siquiera para el owner, solo alcanzables tipeando la URL a mano.

Decisión pendiente para la Fase 4, para las 4 por igual: (a) dejar wacrm
como CRM "de humanos" solamente, sacar Broadcasts/Automations también
del sidebar (ya que hoy no hacen nada) y eventualmente remover el código
muerto, o (b) conectar los endpoints que ya existen y funcionan
(`POST /api/v1/broadcasts`, `send_webhook`) a los flujos reales de n8n
como interfaz humana sobre la misma automatización.
