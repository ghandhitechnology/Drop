# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

React Native. The product is intended for phones and tablets across iOS and Android. The exact React Native framework, backend, authentication, and deployment stack remain open decisions.

## Users

The primary users are consumption-aware people who want to understand the hidden water cost of everyday life. This includes shoppers deciding what to buy in a store and people tracking the food, products, transport, and recurring activities they consume over time, without needing to learn life-cycle-assessment terminology.

## Product Purpose

Drop is a minimal personal water-footprint tracker for the whole of everyday life. It helps a person identify food, consumer goods, transport, and other routine consumption; understand the estimated water footprint before or after the choice; and add confirmed consumption to a personal history. Success means the user can make a more informed choice in seconds and develop an honest, increasingly complete picture of their life over time without burdensome manual logging.

## Positioning

Drop connects fast capture of everyday consumption with a personal, cumulative water-footprint record across categories. Unlike a food-only scanner, it is designed to reveal the hidden water embedded throughout a person's life. Results are grounded in curated life-cycle data rather than calculated or invented by the recognition model, and communicate uncertainty instead of presenting false precision.

## Operating Context

The core use occurs on a phone wherever consumption happens: in a shop, at home, while traveling, or when reviewing the day. Capture should remain usable one-handed and under time pressure. The sketch describes one continuous, progressively revealed interaction rather than a sequence of disconnected forms:

1. The user starts primarily from the camera, photographing an item or recognizable part of an everyday activity. How non-visual activities are captured remains an open interaction decision.
2. Camera recognition maps what was captured to a controlled item, product category, transport mode, or activity identifier.
3. The grounded analysis combines the recognized input with the curated dataset. A separate system-side research search may collect relevant information beyond the dataset, with its sources and reliability kept explicit.
4. The analysis resolves a supported estimate and confidence level. Retrieved information must not be treated as equivalent to validated factor data without verification.
5. The first result is embodied by Drop's hand-drawn avatar, giving the analysis an immediate, living summary instead of opening with a dense report.
6. The user expands the avatar in place. Pencil or crayon-like marks draw outward, fade, and split apart to reveal the result rather than abruptly navigating to an unrelated screen.
7. The revealed result leads with one large, legible footprint number, followed by an optional detailed explanation of assumptions, confidence, methodology, and provenance.
8. The user confirms the purchase or activity before it contributes to their personal history and trends.

Tablet support should preserve the same workflow rather than introduce a separate product mode.

## Capabilities and Constraints

- The product scope includes the water footprint of everyday life: food, consumer products, transport, and other recurring consumption or activities supported by trustworthy data.
- The initial release should demonstrate this whole-life promise with a deliberately curated set of representative categories rather than appearing food-only. Breadth must not imply unsupported product-level precision.
- Camera capture is the primary user interaction and the visual center of the product. Barcode or label recognition may supplement image recognition where product identifiers and coverage support it.
- Search is a separate system capability used to collect supporting information beyond the curated dataset; it is not a co-equal user input or the default visible workflow.
- The recognition or language model may classify and map an item, but must not invent or directly calculate its footprint.
- The trusted data layer, recognized camera input, and any separately retrieved evidence must meet in a grounded analysis step before a result is shown.
- Retrieved evidence must preserve its source, date, and confidence and remain distinguishable from validated dataset factors. Search must not silently turn an unsupported claim into a precise footprint.
- The avatar is the primary compact result and the bridge into deeper information. Expansion should preserve spatial continuity so users understand they are opening the same result, not starting another task.
- Detailed results must prioritize the footprint number, then explanation and evidence. The interface must not bury the core answer in analysis prose.
- Results must use curated, versioned factors and preserve source, release, geography, reference unit, validity period, system boundary, and rights metadata.
- When product, quantity, recipe, geography, or supply chain is uncertain, show ranges and confidence rather than a single exact number.
- A camera capture or completed analysis is not automatically consumption. The user confirms a purchase or activity before it is added to the tracker.
- The exact headline metric remains open: total water footprint, blue/green/grey components, scarcity-weighted impact, or a carefully explained combination.
- Geographic launch market, account model, privacy model, the first representative category set, and how recurring activities are logged remain open decisions.

## Brand Commitments

- Product name: **Drop**.
- A friendly, hand-drawn avatar is a central product character and the living representation of an analysis result.
- The interface should feel hand-drawn, with pencil- or crayon-like marks and smooth drawing motion.
- Expansion is a signature transition: sketch strokes extend around the avatar, fade or split apart, and disclose the numeric result and explanation.
- The product supports both light and dark themes, built around white and black backgrounds respectively.
- The expressive character must not compromise fast comprehension during an everyday decision.

## Evidence on Hand

- [`Plan.md`](Plan.md) records the original goal, camera input, tracking model, phone/tablet ambition, and grounded-model direction.
- [`data/agribalyse/agribalyse_v3.2_detail_by_stage.csv`](data/agribalyse/agribalyse_v3.2_detail_by_stage.csv) provides detailed food life-cycle data by stage.
- [`data/hestia/hestia_food_water_footprints.csv`](data/hestia/hestia_food_water_footprints.csv) and the related HESTIA source files provide food and agricultural footprint evidence.
- [`data/owid_poore_nemecek/freshwater_withdrawals_per_kg.csv`](data/owid_poore_nemecek/freshwater_withdrawals_per_kg.csv) provides comparative food freshwater-withdrawal data.
- [`data/su_eatable_life/SuEatableLife_Food_Footprint_database.xlsx`](data/su_eatable_life/SuEatableLife_Food_Footprint_database.xlsx) provides an additional food-footprint source.
- [`data/useeio/USEEIOv2.5.1-waxwing-22.xlsx`](data/useeio/USEEIOv2.5.1-waxwing-22.xlsx) may support coarse sector-level estimates, not precise consumer-product claims.
- [`LCA_COMMONS_EVALUATION.md`](LCA_COMMONS_EVALUATION.md) documents why Federal LCA Commons is supplementary rather than the primary consumer database.
- The user's photographed sketch establishes the camera as the direct user action; a separate research search and trusted data feeding LLM grounding; analysis embodied by an avatar; an in-place crayon/sketch expansion with fading or splitting motion; and a final result led by a large number with detailed explanation beneath it. The outer frame and left rail are not yet confirmed as literal navigation. The sketch is a product and design reference, not evidence for environmental claims.
- No testimonials, customers, benchmark outcomes, validated recommendation efficacy, or product-level global coverage are currently established. Future work must not fabricate them.

## Product Principles

1. **Capture the whole life.** Make the hidden water in food, goods, movement, and routine activities visible as one personal story.
2. **Useful at the moment of choice.** The core answer must arrive quickly enough to influence a purchase or everyday decision.
3. **Track confirmed behavior.** Build the personal record from purchases and activities the user confirms, not everything they investigate.
4. **Evidence before certainty.** Ground every estimate in traceable data and make uncertainty visible.
5. **Minimal by default, explainable on demand.** Lead with a comprehensible result and keep methodology and assumptions one deliberate expansion away.

## Accessibility & Inclusion

- Core meaning and status must never depend on color, animation, or hand-drawn decoration alone.
- Pencil-like text or marks must remain legible at mobile sizes and under real-world lighting.
- Respect reduced-motion preferences while preserving clear state changes.
- Camera input must have an accessible non-camera fallback, whose exact interaction remains open; the system-side research search is not that fallback.
- Touch targets, screen-reader labels, contrast, and dynamic text behavior must meet native platform expectations.
