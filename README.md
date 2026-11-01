# FORGE Training 10 — Android

Проект из предоставленного комплекта версии 10.0.0. Все тренировки, питание,
рецепты, статистика, импорт/экспорт и облачные функции сохранены в исходном
`app/src/main/assets/index.html`. В версии 10.0.1 обновлены изображения каталога и исправлены обработчики выбора упражнения. Облако требует отдельной
настройки Supabase; локальный дневник работает без него.

## Сборка и проверки

Требуются JDK 17 и Android SDK (platforms;android-36, build-tools;35.0.0).
Укажите ANDROID_HOME либо sdk.dir в локальном local.properties.
Gradle Wrapper автоматически скачивает Gradle 8.13 с проверкой SHA-256.
На Windows путь к проекту должен содержать только латиницу: например,
`C:\Users\ermak\Desktop\FORGE Training\Project`. Android Gradle Plugin
отклоняет путь с кириллицей ещё до компиляции.

Windows:

```powershell
node scripts/check-web.mjs
node scripts/check-art.mjs
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

Linux/macOS:

```sh
node scripts/check-web.mjs
node scripts/check-art.mjs
bash ./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`.
Отчёт lint: `app/build/reports/lint-results-debug.html`.
В исходном комплекте нет unit-тестов: задача testDebugUnitTest может завершиться
со статусом NO-SOURCE. Проверка JavaScript проверяет синтаксис, не поведение UI.

## GitHub Actions

Загрузите **содержимое этой папки**, включая `.github`, в корень репозитория.
Workflow `.github/workflows/build.yml` использует распакованный проект;
старый ZIP версии 2 не является исходником для сборки.
Удалите/замените старые workflow сборки версии 2 при переносе, чтобы не получать
два разных APK. Исходные архивы можно хранить отдельно для истории.

В Actions выберите Build FORGE Training 10 → Run workflow.
После успешного запуска скачайте артефакт `forge-training-10-debug-apk`,
распакуйте ZIP и установите APK на Android 7.0 или новее.
Проверки также запускаются для pull request и push в main/master.

Подписанный release APK/AAB собирается вручную из main при включении
signed_release. Настройте четыре GitHub Actions secrets:
FORGE_KEYSTORE_BASE64, FORGE_KEYSTORE_PASSWORD, FORGE_KEY_ALIAS, FORGE_KEY_PASSWORD.
Ключ удаляется с runner после сборки даже при ошибке. Ключи в Git не загружать.

Для обновления уже установленного приложения требуется та же подпись.
Временная debug-подпись на разных runner может отличаться. Для постоянного
использования нужен собственный стабильный release-ключ. Перед сменой подписи
сделайте JSON-экспорт дневника; удаление приложения удаляет локальные данные.
applicationId, адрес WebView и ключи localStorage в этой доработке сохранены.

## Проверка на телефоне перед выпуском

- Создание программы, дня и упражнения; старт и завершение тренировки.
- Запись подходов, таймер отдыха, восстановление после закрытия приложения.
- Питание, граммовки, рецепты, статистика и калькуляторы 1RM/5RM.
- JSON-экспорт/импорт, CSV и выбор собственных фотографий.
- Работа без интернета, камера и разрешения Android.
- Облачный вход/синхронизация на настроенном Supabase.

Описание исходной версии: README_ТЕЛЕФОН.md, ОБЛАКО_НАСТРОЙКА.md,
ПУБЛИКАЦИЯ_GOOGLE_PLAY.md. Итоги этой доработки: REVIEW.md.

Дополнительный smoke-тест: установите Playwright в отдельное тестовое окружение и Chromium (`npx playwright install chromium`), затем `node scripts/browser-regression.cjs`. Для имеющегося Chromium можно задать FORGE_CHROMIUM. Проверка использует отдельный временный профиль браузера.

Текущий аудит 10.0.2: [таблица функций и доказательства](docs/VERIFICATION-2026-11-01.md). Автотесты: npm install, npx playwright install chromium, npm test. Для Android нужны отдельные проверки на устройстве.

FORGE 11: [Nutrition Coach — функции, формулы, ограничения и тесты](docs/NUTRITION-COACH.md). Открыть: Питание → Nutrition Coach. Применение новой цели только после подтверждения.

FORGE 11.1: существующий Nutrition Coach переработан в мастер, добавлены подробная активность, подтверждённое поддержание, настраиваемые БЖУ и анализ 14/21 дней с отдельным подтверждением. Подробности и ограничения: [NUTRITION-COACH.md](docs/NUTRITION-COACH.md).
