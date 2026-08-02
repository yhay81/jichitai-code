# Decisions

## Static official dataset

The complete 1,965-record dataset is small enough to deliver as one cacheable JSON file. Local search is faster, remains available after the first load, and prevents queries from entering server logs.

## Five and six digits

The official workbook supplies six digits. The product derives the five-digit value only by removing the final check digit and displays the final digit separately. It does not recalculate or replace official codes.

## No authentication

The saved bundle contains public records only and needs at most eight items on one device. An account would add friction and personal-data risk without improving the core lookup.

## Exact Northern Territories codes

The workbook contains two different villages named 泊村. The six Northern Territories records are therefore flagged by their official codes, never by name matching.
