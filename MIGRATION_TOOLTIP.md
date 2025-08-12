# Database Migration: Expand tooltip_text Field

## Issue
The `tooltip_text` field in the `events` table is currently `VARCHAR(255)`, which is too small to store the JSON metadata we now use for:
- Node type information
- Connection data between nodes
- Visual dimensions and scaling
- Other node metadata

## Solution
Expand the `tooltip_text` field from `VARCHAR(255)` to `TEXT` to allow unlimited length JSON storage.

## How to Run the Migration

### Option 1: Using npm script (recommended)
```bash
cd server
npm run migrate:tooltip
```

### Option 2: Direct node execution
```bash
cd server
node config/run_tooltip_migration.js
```

### Option 3: Manual SQL execution
```bash
cd server
psql your_database_url -f config/migration_expand_tooltip_text.sql
```

## What the Migration Does
1. **Creates a backup** - Backs up the current `events` table to `events_backup_tooltip_migration`
2. **Alters the column** - Changes `tooltip_text` from `VARCHAR(255)` to `TEXT`
3. **Adds documentation** - Adds a comment explaining the field's purpose
4. **Verifies success** - Confirms the change was applied correctly

## Safety
- ✅ Non-destructive migration (data preserved)
- ✅ Automatic backup creation
- ✅ Verification of successful completion
- ✅ Rollback possible using backup table if needed

## After Migration
- Nodes can now store large JSON metadata without length restrictions
- Connection data between nodes will save properly
- No application code changes needed - this is a pure database fix

## Error This Fixes
```
Server error: value too long for type character varying(255)
```

This error occurred when trying to save nodes with connection data or complex metadata that exceeded 255 characters.