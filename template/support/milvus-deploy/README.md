# Milvus deployment (Windows + optional)

This compose stack runs Milvus v2.6.16 plus its required dependencies (etcd, MinIO) as three local containers. It's used by **Layer 5** (memsearch vector search) of the memory system.

## When you need this

- **Windows**: required. `milvus-lite` (the default embedded vector store memsearch ships) has no Windows wheels on PyPI. Use this Docker stack instead.
- **Linux / macOS**: optional. memsearch auto-installs milvus-lite and uses it at `~/.memsearch/milvus.db`. Skip this directory entirely unless you specifically want a remote Milvus.

## Bring it up

```bash
cd milvus-deploy
docker compose up -d
```

Wait ~30-60 seconds for all three containers to report `(healthy)`:

```bash
docker compose ps
```

You should see `milvus-etcd`, `milvus-minio`, `milvus-standalone` all `Up (healthy)`.

## Configure memsearch to use it

```bash
memsearch config set milvus.uri "http://localhost:19530"
```

## Bring it down

```bash
docker compose down
```

Volumes persist in `./volumes/` — re-running `up -d` reuses the same data.

## Why a multi-container stack and not just `milvus-standalone`?

Milvus standalone needs etcd (metadata store) and MinIO (object storage for segments and index data). On Linux/macOS, `milvus-lite` bundles all of that into one Python wheel; on Windows there's no equivalent wheel, so the three services run as separate containers.

The single-container `docker run milvusdb/milvus:latest standalone` pattern referenced in some older docs is no longer supported — `latest` is `v3.0-beta` whose entrypoint doesn't accept `standalone` as a command. Use this compose file with the pinned versions instead.

## Known quirk: memsearch index without flush

memsearch v0.4.x doesn't call `flush()` after `MilvusStore.upsert()`. On Milvus v2.6+ (Woodpecker WAL), this means `memsearch index` reports success but the data isn't searchable until a flush forces the growing segment to seal.

Use `scripts/memsearch-index-with-flush.sh` instead of raw `memsearch index` until upstream ships a fix. Tracked as [memsearch issue #534](https://github.com/zilliztech/memsearch/issues/534).

## Pinned versions

| Image | Version | Why pinned |
|---|---|---|
| `milvusdb/milvus` | `v2.6.16` | Latest stable v2.6 line. `latest` tag is v3.0-beta and crashes. |
| `quay.io/coreos/etcd` | `v3.5.25` | Compatible with milvus v2.6. |
| `minio/minio` | `RELEASE.2024-12-18T13-15-44Z` | Recent stable RELEASE tag. |
