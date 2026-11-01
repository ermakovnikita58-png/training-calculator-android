# FORGE Training 10 — что необходимо для Google Play

## Готово в проекте

- Android `compileSdk=36`, `targetSdk=36` для требований новых приложений с 31 августа 2026 года.
- Gradle/AGP 8.13.x, Java 17, сборка debug APK через GitHub Actions.
- Опциональная сборка **подписанного AAB** и release APK при настройке secrets репозитория.
- Локальная HTTPS-среда WebViewAssetLoader вместо `file:///android_asset/`.
- Разрешение камеры только при необходимости сканирования.
- Значки приложения, автономный журнал, экспорт JSON/CSV.

## Что владелец должен сделать лично (невозможно без его учётных данных)

1. Зарегистрировать аккаунт Google Play Console и подтвердить данные разработчика.
2. Выбрать окончательный уникальный `applicationId`, так как после публикации его невозможно заменить без нового приложения. Сейчас указан идентификатор проекта из предыдущих версий для совместимости.
3. Создать в безопасном месте **upload keystore** и его пароль (не публиковать их). Добавить секреты в GitHub: `FORGE_KEYSTORE_BASE64`, `FORGE_KEYSTORE_PASSWORD`, `FORGE_KEY_ALIAS`, `FORGE_KEY_PASSWORD`.
4. В Supabase подключить собственный backend, проверить авторизацию двух пользователей и настроить функцию удаления аккаунта.
5. Опубликовать реальную политику конфиденциальности по HTTPS, указать email поддержки, рабочую страницу удаления аккаунта и заполнить форму **Data safety** в Play Console в соответствии с фактической архитектурой.
6. Провести тесты на реальных Android-устройствах, подтвердить возрастную категорию/контент, подготовить скриншоты, описание, иконку и выполнить требования закрытого тестирования, если Play Console применит их к аккаунту.
7. Собрать подписанный **AAB**, загрузить его в Play Console и дождаться проверки. Debug APK не подходит для публикации.

## Безопасное создание ключа

Пример на компьютере или доверенной облачной среде:
```
keytool -genkeypair -v -keystore forge-upload.jks -keyalg RSA -keysize 3072 -validity 10000 -alias forge-upload
base64 -w 0 forge-upload.jks
```

Содержимое base64 — GitHub secret `FORGE_KEYSTORE_BASE64`, пароль и alias — в остальных secrets. Никогда не включайте ключ в ZIP проекта. Сохрани отдельную резервную копию keystore в защищённом месте.

## Версии Android

В workflow используется Android SDK 36; GitHub runner скачивает нужные инструменты. Сборку Android в текущей среде без Android SDK и Gradle не выполняли, поэтому первая реальная проверка APK/AAB должна пройти в GitHub Actions.

Источники:
- https://support.google.com/googleplay/android-developer/answer/11926878
- https://developer.android.com/build/releases/about-agp
