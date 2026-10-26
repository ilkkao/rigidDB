---
layout: home

hero:
  name: RigidDB
  text: Typed, indexed records in Redis
  tagline: Store plain JavaScript objects in Redis, validated against a schema and searchable through secondary indexes.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/ilkkao/rigidDB

features:
  - title: Strict schema
    details: Every write is validated against a predefined schema with typed fields and null rules.
  - title: Secondary indexes
    details: Unique, non-unique, case-insensitive, and range indexes, with paging and sorting.
  - title: Atomic by design
    details: Each operation runs as a single Lua script, so a record and its indexes are always updated together.
  - title: Transactions
    details: Queue several operations and run them all or nothing, with references to records created in the same transaction.
  - title: Schema migrations
    details: alterSchema() changes the schema and migrates the existing records in one step.
  - title: TypeScript types
    details: Collection names, field values, and queries are checked at compile time from the schema.
---
