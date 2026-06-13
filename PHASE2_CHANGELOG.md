# KURSOR — Фаза 2: CRM-ядро (changelog)

Эта фаза добавляет CRM-инфраструктуру поверх Фазы 1: филиалы, тарифы, группы с расписанием и составом, карточки клиентов (`students_crm`), гибкие права учителей (`teacher_permissions`). Архитектура и стек не меняются — только новые таблицы / роуты / страницы по существующим конвенциям.

## Новые файлы

| Файл | Назначение |
|---|---|
| `server/routes-crm.js` | CRUD для `/api/branches`, `/api/tariffs`, `/api/groups`, `/api/groups/:id/schedule`, `/api/groups/:id/members`, `/api/students-crm`, `/api/teacher-permissions` |

## Изменённые файлы

| Файл | Что изменилось |
|---|---|
| `server/db.js` | Добавлен блок `CREATE TABLE IF NOT EXISTS` для 7 новых таблиц (Фаза 2). Безопасно для существующих БД. |
| `server/index.js` | Подключен новый роутер: `app.use('/api', require('./routes-crm'))` перед `routes-content` |
| `public/admin/index.html` | + 5 новых вкладок в сайдбаре: «Филиалы», «Тарифы», «Группы», «Клиенты», «Права учителей». Маршрутизация в `switch (currentTab)`. Новые render-функции и модалки (`renderBranches`, `renderTariffs`, `renderGroups`, `openGroupDetails`, `renderClients`, `renderTeacherPerms`, и сопутствующие save/remove). |
| `public/pages/teacher.html` | + кнопка «👥 Мои группы» рядом с «Материалы курсов» и «Мои отзывы». Функция `showMyGroups()`: загружает `/api/groups`, `/api/students-crm/me-as-teacher` и `/api/teacher-permissions/:id`, рендерит карточки своих групп с расписанием и составом. |

## Новые таблицы (SQL — см. `server/db.js`)

- `branches (id, name, address)`
- `tariffs (id, name, visits_count, duration_days, price, extra_lessons_separate)`
- `groups (id, name, course_id, branch_id, teacher_id, assistant_id, lesson_kind, status)`
- `group_schedule (id, group_id, weekday, start_time, duration_min)`
- `group_members (id, student_id, group_id, since, until)`
- `students_crm (user_id PK, full_name, birth_date, gender, branch_id, tariff_id, subscription_issued_at, visits_left, status, responsible_manager_id, parent_name, parent_phone, document_id, comment, video_consent, video_consent_date)`
- `teacher_permissions (teacher_id, permission_key, value)` — key-value

## API

CRUD по REST-конвенции (GET list, GET :id, POST, PUT, DELETE):

- `/api/branches` — admin: всё, остальные: только GET
- `/api/tariffs` — admin: всё, остальные: только GET
- `/api/groups` — admin: всё; teacher/assistant: GET (отфильтровано своими группами)
- `/api/groups/:id/schedule` — admin: всё; teacher/assistant: GET (если их группа)
- `/api/groups/:id/members` — admin: всё; teacher/assistant: GET (если их группа)
- `/api/students-crm` — admin only, фильтры: `branch`, `group`, `status`, `manager`
- `/api/students-crm/me-as-teacher` — teacher/assistant: ученики его групп, поля видимости учитывают `teacher_permissions`
- `/api/students-crm/:id` — admin: read+write, teacher: read (если ученик в его группе), `visits_left` / `tariff_id` скрываются без права `see_subscription_balance`
- `/api/teacher-permissions/:teacherId` — GET: admin или сам учитель; PUT: admin (тело — `{ permission_key: bool }`)

## Поддерживаемые ключи прав (можно расширить)

- `can_edit_materials` — может редактировать материалы (без выдачи доступа к курсу)
- `see_subscription_balance` — видит остатки абонементов
- `see_parent_contacts` — видит контакты родителей в «Мои группы»
- `can_create_feedback_internal` — может создавать внутренние отзывы

## Что протестировано

E2E-сценарий (`/home/user/kursor/e2e.sh`) выполнил 21 проверку:

1. CRUD: branch, tariff, group, schedule, member, CRM-карточка — все ОК
2. Фильтрация `/api/students-crm?branch&status` — ОК
3. `me-as-teacher` — возвращает ученика группы учителя
4. `teacher_permissions` PUT/GET — флаги сохраняются и читаются
5. Валидация: отказ от группы с `lessonKind=weird`
6. Каскадные удаления

## Запуск

```bash
npm install
npm start         # http://localhost:3000
# admin: login=admin, password=admin
```

Открыть `http://localhost:3000/admin/index.html` → видна группа «Фаза 2 — CRM» в сайдбаре.
