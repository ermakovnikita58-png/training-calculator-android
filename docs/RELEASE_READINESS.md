# Готовность FORGE Training 11.3.0

Кандидат для проверки. Версия 11.3.0, versionCode 24, пакет `ru.trainingcalculator.app`, minSdk 24, targetSdk 36. Подпись локального проверочного APK сверена с 11.2.5. Сборки PR на GitHub используют ключ своего CI-окружения.

## Основа

| Ветка или PR | Снимок при аудите | Роль |
|---|---|---|
| `main` | `6729fa5` | Ветка публикации |
| [PR №9](https://github.com/ermakovnikita58-png/training-calculator-android/pull/9) | `8d171b2` | Офлайн-контуры, 556 упражнений |
| [PR №10](https://github.com/ermakovnikita58-png/training-calculator-android/pull/10) | `3763a33` | Изменения каталога питания и выбора упражнений, основаны на PR №9 |
| [PR №11](https://github.com/ermakovnikita58-png/training-calculator-android/pull/11) | `2345209` | Безопасный импорт программ и тренировок, основан на PR №10 |
| [PR №12](https://github.com/ermakovnikita58-png/training-calculator-android/pull/12) | `forge-integrations` | Отдельная ветка на PR №11 |

Снимок PR №11 содержит исправления навигации, Performance UI, Nutrition Coach, иллюстрации, настройки каталога и локальный импорт. Использован Git с закреплённой версией исходников.

## Интеграции

| Интеграция | SDK установлен | Сервис подключён | Проверка и статус | Что осталось |
|---|---|---|---|---|
| Firebase Test Lab | gcloud через Actions | Ожидает проекта | `WAITING_FOR_OWNER`, [ручной WIF workflow](../.github/workflows/test-lab.yml) | Проект, IAM, bucket, согласование бюджета, результат матрицы |
| Firebase Crashlytics | Да | Ожидает проекта | `WAITING_FOR_OWNER`, сборка без конфигурации и кнопка теста в [ForgeDiagnostics](../app/src/main/java/ru/trainingcalculator/app/ForgeDiagnostics.kt) | Получить событие в консоли, проверить ANR |
| PostHog | HTTPS Batch API + WorkManager | Ожидает проекта | `WAITING_FOR_OWNER`, очередь и фильтрация в [AnalyticsService](../app/src/main/java/ru/trainingcalculator/app/AnalyticsService.kt) | Проверить доставку, повтор и отзыв согласия в реальном проекте |
| ML Kit | Да, модель в APK | Локально | `CODE_READY`, [JVM-проверка форматов и контрольной цифры](../app/src/test/java/ru/trainingcalculator/app/RetailBarcodeTest.kt) | Распознавание настоящих этикеток без сети на телефоне |
| CameraX | Да | Локально | `CODE_READY`, [тест возврата к ручному вводу](../app/src/androidTest/java/ru/trainingcalculator/app/NavigationBackTest.kt) прошёл на API 35 | Предпросмотр, фокус и фонарь на телефоне |
| Open Food Facts | HTTPS API | Публичный endpoint | `TESTED`, реальный ответ на публичный EAN и [браузерный тест](../scripts/barcode-browser.cjs) | Сквозная проверка с реальной камерой |
| Room + SQLite | Да | Локально | `TESTED`, [тест Room](../app/src/androidTest/java/ru/trainingcalculator/app/DiaryCheckpointTest.kt) на эмуляторе и браузерное восстановление с тестовым мостом | Миграция отдельных сущностей после отдельной проверки, восстановление на телефоне |
| Supabase Auth | HTTPS | Ожидает проекта | `WAITING_FOR_OWNER`, [сессия в Android Keystore](../app/src/main/java/ru/trainingcalculator/app/CloudSessionVault.kt) и браузерный mock | Реальные письма, вход, обновление токена и удаление аккаунта |
| Supabase PostgreSQL | HTTPS + SQL | Ожидает проекта | `WAITING_FOR_OWNER`, [локальный тест PostgreSQL RLS и конфликтов](../scripts/cloud-snapshot.test.cjs) | Миграция проекта владельца, проверка двух аккаунтов и двух устройств |
| Firebase Auth + Firestore | Резерв | Нет | `NOT_STARTED`, [сравнение в инструкции](INTEGRATIONS_SETUP.md#supabase) | Дополнительный backend потребуется при отдельном выборе |
| Health Connect | Системный Android API 34 | Опционально | `CODE_READY`, [тест согласия и дедупликации](../scripts/device-settings-browser.cjs) с тестовым мостом | Системные разрешения, реальный источник и отзыв на Android |
| Play Billing | 9.1.0 в отдельной сборке | Выключен | `CODE_READY`, [flavor с PlayCommerce](../app/src/play/java/ru/trainingcalculator/app/PlayCommerce.kt) собран | Сервер, тестовые товары, лицензированные тестовые аккаунты, тест покупки |
| RuStore Pay | 11.2.0 в отдельной сборке | Выключен | `CODE_READY`, [flavor с RuStoreCommerce](../app/src/rustore/java/ru/trainingcalculator/app/RuStoreCommerce.kt) собран | Сервер, RuStore Console, тестовый каталог и тестовые операции |
| GitHub Actions | YAML | Да | `TESTED`, браузерные проверки, Android build и [проверка обновления](https://github.com/ermakovnikita58-png/training-calculator-android/actions/runs/43021369476) | Закрытые environments для Test Lab и подписи |
| Playwright | Да | Локально и CI | `TESTED`, [прогон CI](https://github.com/ermakovnikita58-png/training-calculator-android/actions/runs/43021369916), 320/360/390/412, офлайн, резервная копия, импорт и конфликты | Физические проверки отдельно |
| Dependabot | [Конфигурация](../.github/dependabot.yml) | После default branch | `CODE_READY` | Дождаться проверок GitHub после принятия конфигурации |
| UI Automator | Да | Эмулятор CI | `TESTED`, 12 инструментальных тестов, включая системный свайп, в [отчёте Android](ANDROID_TEST_REPORT.md) | Жесты, камера и системная клавиатура на физическом устройстве |
| Флаги | Локальные настройки и Gradle | Да | `TESTED` для [запрета платежей](../app/src/test/java/ru/trainingcalculator/app/CommercePolicyTest.kt) и подтверждений импорта, `CODE_READY` для внешних настроек | Пройти QA согласий на подключённых проектах |
| Таймер и уведомления | Android AlarmManager | Локально | `CODE_READY`, действующий таймер и фоновый сигнал по согласию в [RestReminder](../app/src/main/java/ru/trainingcalculator/app/RestReminder.kt) | Проверить разрешение, звук, вибрацию и задержку в режиме сна |

Подробности, ограничения и доказательства приведены в [Android Test Report](ANDROID_TEST_REPORT.md) и [настройке сервисов](INTEGRATIONS_SETUP.md).

## Безопасность и доступность

- Вся основная модель данных, ключ `forge_v2`, HTTPS origin ресурсов и applicationId сохранены. Снимок Room версионирован, запись атомарна, чтение проверяет SHA-256. Деструктивных миграций Room и автоматического восстановления нет. Сохранение JSON на устройстве выполняется системным выбором файла.
- Нативные команды принимает AndroidX WebMessageListener от главного фрейма точного локального origin. Внешние документы не загружаются в WebView с мостом. Прямой файловый доступ и смешанный HTTP-контент запрещены. CSP блокирует внешние скрипты и фреймы. Внутри текущей архитектуры остаются локальные inline-обработчики.
- WebView должен поддерживать WebMessageListener. При отсутствии поддержки автономный дневник остаётся доступен, но нативное резервирование, камера, уведомления и интеграции требуют актуального Android System WebView.
- В манифесте камеры есть необязательный аппаратный feature. Камера, уведомления и чтение трёх типов Health Connect запрашиваются при соответствующем действии. Таймер использует неточный AlarmManager без exact alarm и foreground service. Фоновые уведомления могут задерживаться системой и не гарантируются после перезагрузки или принудительной остановки.
- Ключ PostHog публичный и ограничен приёмом событий, ключи Firebase используются только для привязки к проекту, секретные права Supabase и магазинов остаются вне клиента. Подписанная сборка защищена environment и ручным флагом.
- Управление доступом по подписке отделено от дневника. Сервер проверки подписки, доставка уведомлений магазинов, опубликованная политика приватности и декларации магазинов нужны до релиза. Публичная публикация и платные операции не выполнялись.

## Безопасное обновление на телефоне

1. В установленном FORGE откройте настройки и сохраните внешний JSON. Откройте файл на компьютере или проверьте, что он ненулевого размера.
2. Скопируйте локальный проверочный APK на телефон по USB или через доверенное приложение для файлов. Откройте его в «Файлы» и выберите «Обновить». Через ADB для подключённого устройства используйте `adb install -r FORGE-Training-11.3.0-debug.apk`.
3. Откройте программы, последнюю тренировку, питание и рецепты. Убедитесь, что старые записи присутствуют. При ошибке подписи оставьте установленную версию и сообщите текст ошибки. Для обновления нужен APK, подписанный тем же ключом.
4. При отдельной проверке сделайте локальную копию из настроек, проверьте диагностику и протестируйте отмену восстановления. Для проверки на физическом Android используйте вымышленную тестовую запись и сохранённый внешний JSON.

[Полный список изменённых файлов](https://github.com/ermakovnikita58-png/training-calculator-android/pull/12/files), [коммиты ветки](https://github.com/ermakovnikita58-png/training-calculator-android/pull/12/commits).
