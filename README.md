KURSOR — Платформа школы программирования
KURSOR — это веб-платформа для детских школ программирования. Ученики проходят интерактивные уроки, решают задачи и соревнуются в рейтинге. Учителя следят за прогрессом в реальном времени. Администратор управляет пользователями и контентом через встроенную панель.


Содержание

Технологический стек
Структура проекта
Быстрый старт
Переменные окружения
База данных
REST API
WebSocket
Роли и права доступа
Система уроков
Система задач
Прогресс и геймификация
Frontend-архитектура
Контент: модули и уроки
Добавление контента
Аватарки
Деплой


Технологический стек
СлойТехнологияСерверNode.js 20 + Express 4База данныхSQLite (better-sqlite3, синхронный API)АутентификацияJWT (jsonwebtoken) + bcryptjsRealtimeWebSocket (ws)FrontendVanilla JS + HTML + CSS (без фреймворков)Конфигурацияdotenv
Зависимости намеренно минимальны: никаких сборщиков, никакого TypeScript, никакого Webpack. Проект запускается одной командой на любой машине с Node.js 20.

Структура проекта
kursor-platform/
│
├── server/                     # Backend (Node.js / Express)
│   ├── index.js                # Точка входа: сервер, маршруты, статика
│   ├── db.js                   # Подключение SQLite, создание таблиц, миграции
│   ├── auth.js                 # JWT: signToken, verifyToken, middleware authRequired/requireRole
│   ├── init-db.js              # Первичный засев: admin-аккаунт, модули, задачи, уроки
│   ├── routes-auth.js          # /api/auth — логин, /me, смена пароля
│   ├── routes-users.js         # /api/users — CRUD пользователей, аватарки
│   ├── routes-content.js       # /api/modules, /api/tasks — CRUD контента
│   ├── routes-progress.js      # /api/progress — прогресс, рейтинг, попытки, завершение
│   ├── routes-lessons.js       # /api/lessons — уроки, прогресс intro/miniTask
│   ├── ws.js                   # WebSocket-сервер, broadcastProgress
│   └── db/                     # Директория SQLite-файла (создаётся автоматически)
│       └── kursor.sqlite
│
├── public/                     # Frontend (статика)
│   ├── index.html              # Страница входа (логин)
│   ├── css/
│   │   └── style.css           # Единая таблица стилей всего проекта
│   ├── js/
│   │   ├── api.js              # API-клиент: все запросы к серверу, JWT в localStorage
│   │   └── app.js              # Общие утилиты: navbar, toast, confetti, escapeHtml
│   ├── pages/                  # Страницы SPA
│   │   ├── dashboard.html      # Дашборд ученика
│   │   ├── catalog.html        # Каталог модулей и задач
│   │   ├── task.html           # Страница задачи
│   │   ├── lesson.html         # Страница урока (intro + miniTask)
│   │   ├── profile.html        # Профиль ученика
│   │   ├── teacher.html        # Панель учителя
│   │   └── leaderboard.html    # Рейтинг учеников
│   ├── admin/
│   │   └── index.html          # Панель администратора (SPA)
│   ├── data/
│   │   └── database.js         # Весь контент: модули, задачи, языки, группы
│   └── uploads/
│       ├── mascot/             # Изображения маскота (happy, sad, explain, thinking, sitting)
│       └── avatars/            # Аватарки пользователей (создаётся автоматически)
│
├── data/
│   └── lessons/                # JSON-файлы уроков (загружаются при init-db)
│       ├── _TEMPLATE.json      # Шаблон урока — читай перед созданием нового
│       ├── python-variables.json
│       └── scratch-loops.json
│
├── package.json
└── .env                        # Создать вручную (см. раздел ниже)

Быстрый старт
Требования: Node.js 20+
bash# 1. Установить зависимости
npm install

# 2. Создать .env (или пропустить — используются дефолты)
cp .env.example .env   # если есть, иначе создай вручную

# 3. Запустить сервер
npm start

# Для разработки (авто-перезапуск при изменениях)
npm run dev
После запуска:

Приложение: http://localhost:3000
Health-check: http://localhost:3000/api/health
WebSocket: ws://localhost:3000/ws

При первом запуске автоматически создаётся администратор с логином admin / паролем admin. Смени пароль после первого входа.

Переменные окружения
Создай файл .env в корне проекта:
env# Обязательно для продакшена
JWT_SECRET=замени-на-длинный-случайный-секрет-минимум-32-символа

# Срок жизни токена (по умолчанию 7d)
JWT_EXPIRES_IN=7d

# Порт сервера (по умолчанию 3000)
PORT=3000

# Данные первого администратора (только при пустой БД)
SEED_ADMIN_LOGIN=admin
SEED_ADMIN_PASSWORD=admin
SEED_ADMIN_NAME=Администратор

Если JWT_SECRET не задан или короче 16 символов, сервер запустится с предупреждением в консоли. В продакшене это критично.


База данных
SQLite-файл хранится в server/db/kursor.sqlite и создаётся автоматически при первом запуске. Используется режим WAL (journal_mode = WAL) и внешние ключи включены.
Таблицы
users — все пользователи системы
ПолеТипОписаниеidTEXT PKГенерируется как u_<timestamp36>_<random>loginTEXT UNIQUEЛогин для входаpassword_hashTEXTbcrypt, 10 раундовnameTEXTОтображаемое имяroleTEXTadmin / teacher / studentageINTEGERВозраст (для отображения)group_idINTEGERНомер группы (1 = 6–8 лет, 2 = 9–11, 3 = 12–16)languagesTEXTJSON-массив языков: ["python","html"]teacher_idTEXT FKПривязка ученика к учителюavatar_urlTEXTПуть к аватарке (/uploads/avatars/...)created_atINTEGERUnix timestamp (мс)
progress — общий прогресс ученика (очки, серия, бейджи)
task_progress — прогресс по каждой задаче (попытки, статус, очки, ответ)
modules — учебные модули (темы)
tasks — задачи внутри модулей
lessons — intro-экраны и мини-задача для каждого модуля
lesson_progress — прогресс ученика по уроку (шаг intro, выполнена ли мини-задача)
Миграции
При запуске сервер автоматически добавляет новые колонки в существующие таблицы (например, avatar_url в users). Это позволяет обновлять приложение без потери данных.

REST API
Все маршруты начинаются с /api. Авторизованные запросы требуют заголовка:
Authorization: Bearer <jwt_token>
Аутентификация — /api/auth
МетодПутьДоступОписаниеPOST/api/auth/loginВсеВход. Тело: { login, password }. Возвращает { token, user }GET/api/auth/meАвторизованТекущий пользователь из токенаPOST/api/auth/change-passwordАвторизованСмена пароля. Тело: { oldPassword, newPassword }
Пользователи — /api/users
МетодПутьДоступОписаниеGET/api/usersАвторизованСписок пользователей (student видит только себя)GET/api/users/studentsteacher, adminСписок учеников (teacher — только своих)POST/api/usersadminСоздать пользователяPUT/api/users/:idadmin или владелецОбновить пользователяDELETE/api/users/:idadminУдалить пользователяPOST/api/users/:id/avatarвладелецЗагрузить аватарку (base64 PNG/JPG, до 2 МБ)DELETE/api/users/:id/avatarвладелецУдалить аватарку
Контент — /api/modules, /api/tasks
МетодПутьДоступОписаниеGET/api/modulesАвторизованВсе модулиPOST/api/modulesadmin, teacherСоздать модульPUT/api/modules/:idadmin, teacherОбновить модульDELETE/api/modules/:idadminУдалить модуль (каскадно удаляет задачи)GET/api/tasksАвторизованВсе задачиPOST/api/tasksadmin, teacherСоздать задачуPUT/api/tasks/:idadmin, teacherОбновить задачуDELETE/api/tasks/:idadmin, teacherУдалить задачу
Прогресс — /api/progress
МетодПутьДоступОписаниеGET/api/progress/mestudentСвой прогрессGET/api/progress/leaderboardАвторизованПубличный рейтингGET/api/progressteacher, adminПрогресс всех учениковGET/api/progress/:userIdteacher, adminПрогресс конкретного ученикаPOST/api/progress/attemptstudentЗафиксировать попытку. Тело: { taskId }POST/api/progress/completestudentЗавершить задачу. Тело: { taskId, points, usedHint, submission }

Очки при завершении задачи начисляются на сервере — клиент передаёт points лишь как подсказку, но итоговая сумма вычисляется независимо (quiz=10, fill=15, order=20, code=25, project=50; +5 если без подсказки).

Уроки — /api/lessons
МетодПутьДоступОписаниеGET/api/lessonsАвторизованСписок уроков (id, заголовок, есть ли урок)GET/api/lessons/:moduleIdАвторизованПолный урок с прогрессом ученикаPOST/api/lessons/:moduleId/intro-stepstudentОбновить шаг intro. Тело: { step, total }POST/api/lessons/:moduleId/mini-taskstudentПроверить мини-задачу. Тело: { answer }
Health-check
GET /api/health
Возвращает { status: "ok", users: N, tasks: N, modules: N }. Не требует авторизации.

WebSocket
Подключение: ws://host/ws?token=<jwt>
После успешной авторизации сервер присылает:
json{ "type": "hello", "userId": "...", "role": "student" }
При каждом изменении прогресса ученика сервер рассылает всем заинтересованным (самому ученику + его учителю + всем админам):
json{
  "type": "progress",
  "studentId": "u_...",
  "progress": { ... },
  "t": 1234567890
}
Клиент может слать { "type": "ping" } — сервер ответит { "type": "pong", "t": ... }.

Роли и права доступа
РольМожетadminВсё: CRUD пользователей, модулей, задач; видит весь прогрессteacherСоздавать/редактировать модули и задачи; видеть учеников своей группыstudentПроходить уроки и задачи; видеть свой прогресс и рейтинг
Учитель видит только тех учеников, у которых teacher_id совпадает с его id. Если у ученика teacher_id = null, его видят все учителя и все администраторы.

Система уроков
Каждый урок привязан к модулю и состоит из трёх частей:
Урок
 ├── intro[]          — 2–4 экрана «Далее» с теорией (HTML, видео, код)
 ├── miniTask         — одна короткая задача для проверки понимания
 └── tasks[]          — ссылки на задачи из таблицы tasks этого модуля
Прогресс урока хранится в lesson_progress:

intro_step — номер последнего просмотренного экрана
intro_done — вся теория пройдена (булево)
mini_done — мини-задача решена (булево)

Это отдельно от task_progress — задачи засчитываются независимо от прохождения урока.

Система задач
Типы задач
ТипОписаниеПоляquizТест с одним правильным ответомoptions[], answer (индекс)fillВписать пропущенное словоanswer (строка, регистронезависимо)orderРасставить элементы в правильный порядокitems[]codeНаписать код с ожидаемым выводомstarter, expectedOutputprojectПроектное задание (свободный ответ)description
Начисление очков
quiz     → 10 базовых очков
fill     → 15
order    → 20
code     → 25
project  → 50

+ 5 бонусных очков, если задача решена без подсказки
Задача засчитывается один раз. Повторные попытки увеличивают счётчик attempts, но очки не начисляются повторно.

Прогресс и геймификация
Серия (streak)
Серия увеличивается на 1 за каждый новый день, в который ученик решил хотя бы одну задачу впервые. Если день пропущен — серия сбрасывается до 1.
Бейджи
БейджУсловиеbeginnerВыдаётся при регистрацииfirst_codeПервая решённая задача любого типаstreak_3Серия 3 дня подрядstreak_7Серия 7 дней подрядstreak_30Серия 30 дней подряд
Рейтинг
GET /api/progress/leaderboard возвращает всех учеников, отсортированных по очкам. Доступен всем авторизованным пользователям.

Frontend-архитектура
Фронтенд — чистый HTML/JS без фреймворков. Все страницы — статические HTML-файлы; навигация между ними — обычные ссылки (не клиентский роутер).
api.js — API-клиент
Единый объект window.API, доступный на всех страницах. Хранит JWT в localStorage под ключом kursor_jwt, кэш текущего пользователя — под kursor_user_cache.
При получении 401 с сервера автоматически очищает токен и редиректит на /index.html.
Основные методы:
javascriptAPI.login(login, password)         // → user
API.logout()
API.getCurrentUser()               // синхронно, из localStorage
API.refreshCurrentUser()           // → user (свежие данные с сервера)
API.requireAuth(['student'])       // редирект если нет прав, иначе возвращает user

API.getModules()
API.getTasks()
API.getMyProgress()
API.recordAttempt(taskId)
API.recordComplete(taskId, points, usedHint, submission)

API.connectWS(onMessage)           // WebSocket с авто-авторизацией
app.js — общие утилиты
javascriptrenderNavbar(activePage)   // HTML навбара с учётом роли
showToast(msg, type)       // всплывающее уведомление ('success'|'error'|'info')
fireConfetti()             // конфетти при правильном ответе
escapeHtml(str)            // экранирование XSS
getQueryParam(name)        // ?name=value из URL
logout()                   // очистить токен и уйти на /index.html
Редиректы по роли
После логина пользователь автоматически попадает на нужную страницу:
РольСтраницаadmin/admin/index.htmlteacher/pages/teacher.htmlstudent/pages/dashboard.html

Контент: модули и уроки
public/data/database.js
Главный файл контента. Содержит объект window.KURSOR_DB с полями:

MODULES[] — список учебных модулей
TASKS[] — все задачи (каждая привязана к module по id)
LANGS — конфигурация языков/технологий (Scratch, Python, HTML, Java и т.д.)
GROUPS — возрастные группы (1 = 6–8 лет, 2 = 9–11 лет, 3 = 12–16 лет)
MASCOT — пути к изображениям маскота
LOGO — URL логотипа

При первом запуске сервер читает этот файл через vm.runInContext и переносит данные в SQLite. Последующие правки в файле не применяются автоматически — контент управляется через API (или через админ-панель).
data/lessons/*.json
JSON-файлы уроков. Формат — см. data/lessons/_TEMPLATE.json. При первом запуске сервер загружает все файлы из этой директории.

Добавление контента
Через админ-панель (рекомендуется)

Войди как admin
Перейди в раздел «Модули и темы» → создай модуль
Перейди в раздел «Задачи» → создай задачи, указав module (ID модуля)

Через JSON (для уроков)
Скопируй data/lessons/_TEMPLATE.json, заполни поля, положи в data/lessons/. Урок загрузится при следующем старте на чистой БД. Чтобы загрузить в уже существующую БД, используй API:
bash# Пример: загрузить урок через API (нужен токен администратора)
curl -X POST http://localhost:3000/api/lessons/python_variables \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d @data/lessons/python-variables.json
Структура урока (JSON)
json{
  "moduleId": "python_variables",
  "lang": "python",
  "title": "Переменные",
  "description": "Что такое переменная и как её создать",
  "intro": [
    {
      "title": "Что такое переменная?",
      "emoji": "📦",
      "body": "<p>Переменная — это <b>ящик</b> для хранения данных.</p>",
      "code": "x = 5\nprint(x)"
    }
  ],
  "miniTask": {
    "type": "quiz",
    "title": "Проверь себя",
    "description": "Как записать переменную x равную 10?",
    "options": ["x == 10", "x = 10", "let x = 10", "var x = 10"],
    "answer": 1,
    "explain": "В Python переменная объявляется просто: x = 10",
    "points": 5
  }
}
Поле intro[].code отображается в блоке с подсветкой синтаксиса. Поле intro[].video принимает ссылку формата https://www.youtube.com/embed/VIDEO_ID.

Аватарки
Ученик загружает аватарку со страницы профиля. Файл передаётся как Data URL (data:image/png;base64,...) в теле POST-запроса.
Ограничения:

Максимум 2 МБ
Только PNG и JPG (проверяется по magic bytes, не по MIME)
Менять аватарку может только сам владелец аккаунта

Файлы хранятся в public/uploads/avatars/ под именем <userId>__<timestamp>.<ext>. При загрузке новой аватарки старый файл удаляется автоматически.

Деплой
Минимальный деплой (VPS / bare metal)
bash# 1. Установить Node.js 20
# 2. Клонировать / распаковать проект
# 3. Установить зависимости
npm install --production

# 4. Создать .env с настоящим JWT_SECRET
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "PORT=3000" >> .env

# 5. Запустить
node server/index.js
Рекомендуется запускать через pm2:
bashnpm install -g pm2
pm2 start server/index.js --name kursor
pm2 save
pm2 startup
Reverse proxy (Nginx)
nginxserver {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        # Обязательно для WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

WebSocket (/ws) работает через тот же порт, что и HTTP. При использовании Nginx обязательны заголовки Upgrade и Connection.

Бэкап БД
bash# Безопасная копия SQLite в режиме WAL
cp server/db/kursor.sqlite server/db/kursor.sqlite.backup

# Или онлайн-дамп без остановки сервера
sqlite3 server/db/kursor.sqlite ".backup backup.sqlite"

Часто задаваемые вопросы
Как сбросить базу данных?
Удали файл server/db/kursor.sqlite. При следующем запуске БД и контент будут воссозданы из database.js и data/lessons/.
Как изменить дефолтный пароль администратора?
Войди под admin / admin, открой профиль и смени пароль через форму. Или задай переменные SEED_ADMIN_LOGIN / SEED_ADMIN_PASSWORD в .env до первого запуска.
Можно ли добавить новый тип задачи?
Да. Добавь значение в CHECK(type IN (...)) в db.js, обработай его в routes-progress.js (логика начисления очков) и в нужных HTML-страницах.
Где хранится токен на клиенте?
В localStorage под ключом kursor_jwt. При выходе или получении 401 токен удаляется автоматически.
Поддерживается ли HTTPS?
HTTPS нужно настроить на уровне Nginx (с Let's Encrypt или своим сертификатом). Само приложение работает по HTTP — SSL-терминация на прокси. WebSocket при этом автоматически переключится на wss://.
