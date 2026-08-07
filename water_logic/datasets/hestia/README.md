We currently make data available in three formats (JSON-LD, expanded csv, and compacted csv) and in three states (original, recalculated, and aggregated). They are described below. All formats follow the schema and glossary of terms which are documented at https://hestia.earth/schema and https://hestia.earth/glossary.

Formats:
1. JSON-LD files (with extension .jsonld). These files follow the JSON-LD convention and use the HESTIA JSON-LD schema. They are suitable for web based applications, software development, machine learning applications, or data exchange.
2. Expanded Comma Separated Value (CSV) files (with extension .csv). They are UTF-8 comma delimited files. These files have the term identifier in a separate column to the term value. This can be a more flexible format if you are working with many different terms in a single file.
3. Compacted Comma Separated Value (CSV) files (with extension .csv). They are UTF-8 comma delimited files. These files have the term identifier (term.@id) in the column header. They are a more typical format for most data analysis applications which expect column headers to identify the data.

States:
1. Original data from the source, without any recalculation or gap filling performed by the HESTIA models.
2. Recalculated, where the HESTIA models have gap filled the activity data (e.g., Inputs, Products, Measurements) and recalculated the Emissions and Impact Assessments. The gap filling and recalculation is documented at https://www.hestia.earth/docs/.
3. Aggregated, where many recalculated Sites, Cycles, and Impact Assessments have been averaged to create data describing the average production of a product, in a country, during a certain date period (e.g., "Wheat, grain - Brazil - 2010-2024"). Aggregations may also differentiate by production system too (e.g., "Wheat, grain - Organic, Irrigated - Brazil - 2010-2024").


Download Summary:
- Site: 147 included
- ImpactAssessment: 147 included
- Cycle: 147 included
