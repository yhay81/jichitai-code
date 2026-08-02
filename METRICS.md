# Product metrics

`npm run metrics` reads the production D1 event table and reports anonymous, non-QA usage.

The primary signals are unique users, searchers, successful versus no-result searches, code copiers, saved-list users, official-source openers, and returning saved-list users. Prefecture and type selection are supporting usability signals. Seven-day searcher and copier counts make early usage changes visible.

An event records no query, prefecture, organization name, or code. A search is counted as successful only when the current local filters return at least one result. Automated QA is stored with `is_qa = 1` and excluded from user totals.
