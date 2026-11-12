# AI SQL access (internal research)

Source-only review, 7 November 2026. Runtime supplied by the task: Bun 1.4.4. No target code, queries, builds or tests executed.

## Finding

Bun 1.4.4 exposes no public `sqlite3_set_authorizer` binding or equivalent table/column/function allowlist. Its [versioned TypeScript API](https://github.com/oven-sh/bun/blob/bun-v1.4.4/packages/bun-types/sqlite.d.ts) and [JS implementation](https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/js/bun/sqlite.ts) expose read-only opening/deserialisation, preparation flags, functions, update hooks and `fileControl`, but no authorizer. `SQLITE_PREPARE_NO_VTAB` can reject virtual-table use; it cannot restrict ordinary tables, columns or scalar functions. `Statement.readonly` reports write behaviour, not data access permissions. `fileControl` is a VFS interface, not a general SQLite C-API bridge.

**`Database.handle` is an identifier, not a pointer.** The versioned typings describe a process-local number, retained after close. In [native source](https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/jsc/bindings/sqlite/JSSQLStatement.cpp#L240-L247), `VersionSqlite3::create` assigns `nextHandleNumber++`; `jsSQLStatementHandleNumberFunction` returns that number (lines 1973–1982). Passing it as `sqlite3*` to FFI is invalid. Recovering the private connection would require unsupported internals.

## Existing cost and exposure

[server/ai/chat/routes.ts](../../server/ai/chat/routes.ts) calls `db.$client.serialize()` as the subprocess's stdin **on every SQL-tool invocation**, before `Bun.spawn` begins its 2,000 ms timeout. It does not copy for structured-tool calls. One question can cause several SQL calls in the ten-turn tool loop. [server/ai/chat/sql.ts](../../server/ai/chat/sql.ts) receives the whole image, patches its WAL header, deserialises read-only and iterates up to 201 rows to return 200 plus truncation status. This is already whole-database serialisation, transfer and child deserialisation, not a cheap live read. The parent serialisation cost is outside the child timeout; 200 rows does not bound query work or response bytes.

The copy includes everything in the main database, not just the schema advertised to the model. [server/schema.ts](../../server/schema.ts) includes password hashes, sessions, token hashes, attachment blobs and chat messages. Omitting names from tool instructions would not prevent SQL access. No exploit was run; this is a source-established access path.

## What an authorizer would enforce

[SQLite's authorizer](https://www.sqlite.org/c3ref/set_authorizer.html) is connection-wide and normally runs at preparation, not execution. Install it before preparing untrusted SQL; retain it through stepping/repreparation and avoid statements cached before the policy. Permit approved database/table/column reads and approved functions; deny other actions by default. Handle NULL arguments and `count(*)`'s empty column name. Prefer denial to silent NULL substitution. Only one authorizer exists per connection, so a dedicated AI connection avoids changing ordinary application operations. It does not implement row permissions; generated-column expressions have special authorisation timing.

The [action codes](https://www.sqlite.org/c3ref/c_alter_table.html) distinguish reads, functions, PRAGMA, ATTACH/DETACH, writes and schema/virtual-table creation. Deny unneeded actions, including attachment and schema access. [PRAGMA](https://www.sqlite.org/pragma.html) can change connection behaviour during preparation, and some pragmas have table-valued forms callable from SELECT. [Virtual tables](https://www.sqlite.org/vtab.html) can invoke native modules, including eponymous modules without CREATE. Scalar functions can also perform external work. Thus read-only main storage, views, a SELECT-prefix regex and a result cap are not security boundaries for approved-data-only access.

[SQLite security guidance](https://www.sqlite.org/security.html) recommends defensive mode, tighter resource limits, execution interruption and memory limits alongside authorisation. Bun's native open/deserialise paths enable defensive mode. Its C-only extension-loading configuration does not enable SQL `load_extension`; SQLite [distinguishes these switches](https://www.sqlite.org/c3ref/enable_load_extension.html). Do not infer availability of arbitrary filesystem functions in stock Bun: the deployed module/function inventory still needs validation.

## Options and maintenance

| Approach | Cost and constraint |
| --- | --- |
| Public authorizer on an existing DB | Ideal indexed reads without copying, but unavailable in Bun 1.4.4. Would need a supported runtime change or another driver. Prefer a dedicated connection if this becomes available. |
| Native extension / FFI | A [loadable extension](https://www.sqlite.org/loadext.html) receives the real connection and SQLite API table; it can install an authorizer through supported SQLite interfaces, loaded with Bun's public `loadExtension`. Requires compiling/shipping a trusted native library per target and testing policy, lifetime and ABI behaviour. Bun's typings note macOS needs custom SQLite for extension loading. FFI can load an existing library without compiling a custom bridge, or own a separate SQLite connection; it cannot use Bun's numeric handle. Callback lifetime, matching library ownership and cross-platform packaging add work. [Bun labels FFI experimental](https://bun.com/docs/runtime/ffi). |
| Approved snapshot only on SQL fallback | Keep structured tools as the normal path. On SQL calls, populate a fresh plain schema from explicit approved columns/rows, then transfer only that DB to the child. No native dependency; costs extraction, insertion, serialisation and startup per fallback. Smaller data may offset this, but requires measurement. Never sanitise a full copy by deleting secrets: build from approved values so excluded data never enters the image. |
| Structured tools only | No SQL snapshot or arbitrary SQL; parameterised application queries define access. Least security machinery, but each new analytical shape needs code and unsupported questions lose SQL flexibility. |

## Recommendation and validation

Use a fresh approved snapshot on SQL fallback if retaining ad hoc analysis is required; it fits the existing subprocess design without a native dependency. Keep structured tools first. This does not add copying to every question: current SQL calls already copy the entire DB. Do not promise lower latency before measuring extraction/insertion versus current serialisation, including attachment-heavy databases.

A snapshot alone restricts the data present, **not the child process's authority**. Before calling arbitrary SQL safe, establish an OS boundary that denies access to live DB files, secrets and network, and bound CPU, memory, output and wall time. If that cannot be provided, use structured tools only rather than claim the snapshot enforces a function allowlist. Do not replace engine checks with views or regex SQL filtering.

Acceptance criteria for implementation: approved joins/aggregates work; excluded tables/columns and sentinel credentials never enter the image or result; transaction status/deletion and currency semantics remain explicit; ATTACH, PRAGMA variants, virtual tables, extension/function escape paths and schema access cannot reach protected resources; multi-statement inputs cannot execute an unchecked tail; expensive queries and huge single values terminate within bounds. Verify policy before preparation and across cached/reprepared statements if adopting an authorizer. Measure parent blocking time, end-to-end latency, peak memory and transferred bytes over representative sizes and repeated calls. No timing, sandbox efficacy, deployment library inventory or platform compatibility was verified in this research.
