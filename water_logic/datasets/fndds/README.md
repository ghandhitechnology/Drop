# USDA FoodData Central — FNDDS 2021–2023

Source: [USDA FoodData Central downloads](https://fdc.nal.usda.gov/download-datasets/)

File: `FoodData_Central_survey_food_json_2024-10-31.zip`

- Release: FNDDS 2021–2023, published 2024-10-31
- Records: 5,432 Survey Foods
- SHA-256: `dfb06ae7ddc397ccd570b91c14b75438ab2ba39f64f22d321f61d4a52a77f3eb`
- Rights: CC0 1.0 / U.S. public domain

## Role in Drop

FNDDS provides consumer-facing food names, WWEIA categories, and measured
portion weights. It is **not** a water-footprint source. The pipeline maps only
reviewed FNDDS categories to existing SU-EATABLE typology factors, and those
results remain visibly category-level matches.

The raw archive also contains `inputFoods` composition records. They are kept
for future prepared-dish work, but are not automatically treated as complete
recipes: many point to another composite food rather than elemental
ingredients.

Drop uses the versioned bulk archive offline. The app does not call the
FoodData Central API during recognition or estimation.
