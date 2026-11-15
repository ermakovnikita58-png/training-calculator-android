# FORGE 11.2.4 — каталог продуктов и выбор упражнений

Выборщик программы использовал старую таблицу, где девять групп ссылались на схематичные SVG. Основная библиотека уже показывала WebP из утверждённого реестра. Теперь библиотека, выборщики программы и тренировки и карточка упражнения получают один ресурс через `ForgeArtStandards.muscleGroup`. Поиск поддерживает стабильный ID группы и её названия. Для кардио и мобильности сохранена нейтральная анатомия без выделения случайных мышц.

| Группа | Стабильный ID | Ресурс |
|---|---|---|
| Грудь | chest | [anatomy/muscle-0.webp](../app/src/main/assets/anatomy/muscle-0.webp) |
| Спина | back | [anatomy/muscle-1.webp](../app/src/main/assets/anatomy/muscle-1.webp) |
| Плечи | shoulders | [anatomy/muscle-2.webp](../app/src/main/assets/anatomy/muscle-2.webp) |
| Бицепс | biceps | [anatomy/muscle-3.webp](../app/src/main/assets/anatomy/muscle-3.webp) |
| Трицепс | triceps | [anatomy/muscle-4.webp](../app/src/main/assets/anatomy/muscle-4.webp) |
| Предплечья | forearms | [anatomy/reference-v3/forearms.webp](../app/src/main/assets/anatomy/reference-v3/forearms.webp) |
| Пресс | abs | [anatomy/reference-v3/abs.webp](../app/src/main/assets/anatomy/reference-v3/abs.webp) |
| Ягодицы | glutes | [anatomy/reference-v3/glutes.webp](../app/src/main/assets/anatomy/reference-v3/glutes.webp) |
| Квадрицепс | quads | [anatomy/reference-v3/quads.webp](../app/src/main/assets/anatomy/reference-v3/quads.webp) |
| Бицепс бедра | hamstrings | [anatomy/reference-v3/hamstrings.webp](../app/src/main/assets/anatomy/reference-v3/hamstrings.webp) |
| Икры | calves | [anatomy/reference-v3/calves.webp](../app/src/main/assets/anatomy/reference-v3/calves.webp) |
| Нижняя спина | lower-back | [anatomy/reference-v3/lower-back.webp](../app/src/main/assets/anatomy/reference-v3/lower-back.webp) |
| Кардио | cardio | [anatomy/reference-v3/cardio.webp](../app/src/main/assets/anatomy/reference-v3/cardio.webp) |
| Мобильность | mobility | [anatomy/reference-v3/mobility.webp](../app/src/main/assets/anatomy/reference-v3/mobility.webp) |

Выборщики программы, недельного плана и активной тренировки используют общие карточки, фильтрацию и контурные иллюстрации упражнений. Программный редактор сохраняет черновик, прокрутку и выбор при возврате из карточки. Базовые и пользовательские упражнения считаются отдельно. Чистый каталог содержит 556 базовых записей. С семью отдельными пользовательскими упражнениями общий счётчик показывает 563. Это тестовый сценарий, состав каталога на устройстве владельца доступен только на самом устройстве.

Каталог продуктов сохраняет локальный поиск, порции, избранное, недавние и свои продукты. Категории доступны в прокручиваемой строке и в полной панели. Онлайн-поиск упакованных товаров открывается отдельно. Рационы и повтор вчерашнего рациона доступны из раздела «Рационы».

[Скриншоты обоих экранов до и после на 320, 360, 390 и 412 CSS-пикселях](catalog-picker-screenshots). Снимки «до» сделаны на коммите 8d171b2. Браузерный тест проверяет все 14 групп, пути и декодирование WebP на каждом экране, создание программы, возврат из карточки и добавление порции. Внешние сетевые запросы в тесте блокируются.

Android-тесты системной кнопки «Назад» собраны. Для запуска нужен телефон или эмулятор. Анатомические изображения просмотрены визуально. Биомеханическая экспертиза остаётся отдельной проверкой.
