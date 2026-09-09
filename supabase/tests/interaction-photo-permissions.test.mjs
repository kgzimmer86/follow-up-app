// Isolated PostgreSQL permission checks with invented records; no live Storage API.
// Set FOLLOW_UP_PGLITE_MODULE to a temporary @electric-sql/pglite dist/index.js.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')
const originalSql = await readFile(new URL('../migrations/20260908_interaction_photos.sql', import.meta.url), 'utf8')
const correctionSql = await readFile(new URL('../migrations/20260909_interaction_photo_delete_permissions.sql', import.meta.url), 'utf8')
const bucket = 'follow-up-interaction-photos'

test('interaction photo deletion permissions', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema private;
    create schema storage;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, role text, is_active boolean);
    create table public.follow_up_campaigns (id uuid primary key, status text);
    create table public.follow_up_contacts (
      id uuid primary key, campaign_id uuid references public.follow_up_campaigns,
      status text default 'go_back', primary_owner_id uuid
    );
    create table public.follow_up_events (
      id uuid primary key default gen_random_uuid(), contact_id uuid references public.follow_up_contacts,
      performed_by uuid, event_type text default 'interaction'
    );
    create table storage.buckets (
      id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null,
      owner_id text, unique(bucket_id, name)
    );
    create function storage.foldername(value text) returns text[] language sql immutable as
      $$ select (string_to_array(value, '/'))[1:array_length(string_to_array(value, '/'), 1)-1] $$;
    create function private.is_approved_user() returns boolean language sql stable security definer
      set search_path to '' as $$
        select exists(select 1 from public.profiles where id = auth.uid() and is_active and role <> 'pending')
      $$;
    grant usage on schema auth, private, storage to anon, authenticated;
    grant select on public.profiles, public.follow_up_campaigns, public.follow_up_contacts, public.follow_up_events
      to anon, authenticated;
    grant select, insert, delete on storage.objects to anon, authenticated;
    alter table storage.objects enable row level security;
    alter table public.profiles enable row level security;
    create policy own_profile on public.profiles for select using (id = auth.uid());
    -- Deliberately hide other people's events. The deletion check must still see them.
    alter table public.follow_up_events enable row level security;
    create policy own_events on public.follow_up_events for select using (performed_by = auth.uid());
  `)
  await db.exec(originalSql)
  const users = Object.fromEntries(['leader', 'other', 'discipler', 'staff', 'admin', 'inactive', 'pending', 'inactiveStaff'].map((key) => [key, randomUUID()]))
  for (const [key, role, active] of [
    ['leader', 'student_leader', true], ['other', 'student_leader', true],
    ['discipler', 'discipler', true], ['staff', 'staff', true], ['admin', 'admin', true],
    ['inactive', 'student_leader', false], ['pending', 'pending', true], ['inactiveStaff', 'staff', false],
  ]) {
    await db.query('insert into public.profiles values ($1, $2, $3)', [users[key], role, active])
  }
  const campaign = randomUUID(), closedCampaign = randomUUID()
  const contactId = randomUUID(), closedContactId = randomUUID()
  await db.query("insert into public.follow_up_campaigns values ($1, 'active'), ($2, 'closed')", [campaign, closedCampaign])
  // Contact assignment does not determine who may delete a photo.
  await db.query('insert into public.follow_up_contacts(id, campaign_id, primary_owner_id) values ($1, $2, $3), ($4, $5, $3)',
    [contactId, campaign, users.other, closedContactId, closedCampaign])

  async function asUser(userId, action, role = 'authenticated') {
    await db.query("select set_config('test.user_id', $1, false)", [userId ?? ''])
    await db.exec(`set role ${role}`)
    try { return await action() } finally { await db.exec('reset role') }
  }
  async function photo(owner = users.leader, contact = contactId, selectedBucket = bucket, path) {
    const id = randomUUID()
    const name = path ?? `interaction-attachments/${contact}/${randomUUID()}.jpg`
    await db.query('insert into storage.objects(id, bucket_id, name, owner_id) values ($1, $2, $3, $4)', [id, selectedBucket, name, owner])
    return { id, name, contact }
  }
  async function interaction(image, author = users.leader) {
    const id = randomUUID()
    await db.query(`insert into public.follow_up_events
      (id, contact_id, performed_by, attachment_path, attachment_name, attachment_mime_type, attachment_size_bytes)
      values ($1, $2, $3, $4, 'Example notes.jpg', 'image/jpeg', 1024)`, [id, image.contact, author, image.name])
    return id
  }
  // DELETE targets only the invented metadata table above. Real photos must
  // always be removed through the Storage API, as the production app does.
  const remove = async (image) => (await db.query('delete from storage.objects where id = $1 returning id', [image.id])).rows.length
  const canSee = async (image) => (await db.query('select id from storage.objects where id = $1', [image.id])).rows.length === 1
  const rpcDefinition = async () => (await db.query("select pg_get_functiondef('public.log_interaction_with_attachment(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,text,text,text,integer)'::regprocedure) as definition")).rows[0].definition

  await t.test('original policy reproduces another leader deleting a photo', async () => {
    const image = await photo()
    await interaction(image)
    assert.equal(await asUser(users.other, () => remove(image)), 1)
  })

  await t.test('complete correction reapplies without altering photos, history, or the save function', async () => {
    const image = await photo()
    await interaction(image)
    const beforeObjects = (await db.query('select * from storage.objects order by id')).rows
    const beforeEvents = (await db.query('select * from public.follow_up_events order by id')).rows
    const beforeRpc = await rpcDefinition()
    await db.exec(correctionSql)
    await db.exec(correctionSql)
    assert.deepEqual((await db.query('select * from storage.objects order by id')).rows, beforeObjects)
    assert.deepEqual((await db.query('select * from public.follow_up_events order by id')).rows, beforeEvents)
    assert.equal(await rpcDefinition(), beforeRpc)
    const policy = (await db.query("select permissive, cmd from pg_policies where policyname = 'Interaction photo deletion requires owner or staff'")).rows[0]
    assert.deepEqual(policy, { permissive: 'RESTRICTIVE', cmd: 'DELETE' })
  })

  await t.test('another leader or discipler can view but cannot delete the recorder’s photo', async () => {
    const image = await photo()
    await interaction(image)
    for (const userId of [users.other, users.discipler]) {
      await asUser(userId, async () => {
        assert.equal(await canSee(image), true)
        assert.equal(await remove(image), 0)
      })
    }
    assert.equal(await asUser(users.leader, () => remove(image)), 1)
  })

  await t.test('the uploader can still remove a photo after its interaction has been deleted', async () => {
    for (const userId of [users.leader, users.discipler]) {
      const image = await photo(userId)
      const eventId = await interaction(image, userId)
      // Model the existing authorized event RPC committing before Storage removal.
      await db.query('delete from public.follow_up_events where id = $1', [eventId])
      assert.equal(await asUser(users.other, () => remove(image)), 0)
      assert.equal(await asUser(userId, () => remove(image)), 1)
    }
  })

  await t.test('unsaved uploads can be cleaned up by their uploader', async () => {
    const image = await photo()
    assert.equal(await asUser(users.other, () => remove(image)), 0)
    assert.equal(await asUser(users.leader, () => remove(image)), 1)
  })

  await t.test('staff and admin retain deletion access before and after an interaction is deleted', async () => {
    for (const userId of [users.staff, users.admin]) {
      for (const deleted of [false, true]) {
        const image = await photo()
        const eventId = await interaction(image)
        if (deleted) await db.query('delete from public.follow_up_events where id = $1', [eventId])
        assert.equal(await asUser(userId, () => remove(image)), 1)
      }
    }
  })

  await t.test('another person’s hidden interaction prevents uploader-only deletion of a shared file', async () => {
    const image = await photo()
    await interaction(image)
    await interaction(image, users.other)
    await asUser(users.leader, async () => {
      assert.equal((await db.query('select id from public.follow_up_events where attachment_path = $1', [image.name])).rows.length, 1)
      assert.equal(await remove(image), 0)
    })
    assert.equal(await asUser(users.staff, () => remove(image)), 1)
  })

  await t.test('recording an interaction does not grant permission to delete someone else’s upload', async () => {
    const image = await photo(users.other)
    await interaction(image, users.leader)
    assert.equal(await asUser(users.leader, () => remove(image)), 0)
    assert.equal(await asUser(users.other, () => remove(image)), 0)
    assert.equal(await asUser(users.admin, () => remove(image)), 1)
  })

  await t.test('ownerless files remain staff-managed', async () => {
    const image = await photo(null)
    assert.equal(await asUser(users.leader, () => remove(image)), 0)
    assert.equal(await asUser(users.admin, () => remove(image)), 1)
  })

  await t.test('signed-out, pending and inactive accounts cannot delete photos', async () => {
    for (const userId of [null, users.pending, users.inactive, users.inactiveStaff, randomUUID()]) {
      const image = await photo(userId)
      assert.equal(await asUser(userId, () => remove(image), userId ? 'authenticated' : 'anon'), 0)
    }
  })

  await t.test('closed campaigns and malformed or missing contacts remain protected', async () => {
    const images = [
      await photo(users.leader, closedContactId),
      await photo(users.leader, randomUUID()),
      await photo(users.leader, contactId, bucket, `wrong-folder/${contactId}/example.jpg`),
      await photo(users.leader, contactId, bucket, 'interaction-attachments/not-a-uuid/example.jpg'),
    ]
    for (const image of images) {
      for (const userId of [users.leader, users.staff]) assert.equal(await asUser(userId, () => remove(image)), 0)
    }
  })

  await t.test('upload and view policies are unaffected', async () => {
    const name = `interaction-attachments/${contactId}/${randomUUID()}.jpg`
    await asUser(users.leader, async () => {
      await db.query('insert into storage.objects(bucket_id, name, owner_id) values ($1, $2, $3)', [bucket, name, users.leader])
      assert.equal((await db.query('select name from storage.objects where name = $1', [name])).rows.length, 1)
    })
    await asUser(users.pending, async () => {
      await assert.rejects(db.query('insert into storage.objects(bucket_id, name, owner_id) values ($1, $2, $3)', [bucket, `${name}.png`, users.pending]), /row-level security/)
    })
  })

  await t.test('a broad allow-policy cannot bypass the guard, and other buckets keep their permissions', async () => {
    await db.exec(`
      create policy broad_read on storage.objects for select to public using (true);
      create policy broad_delete on storage.objects for delete to public using (true);
    `)
    const image = await photo()
    await interaction(image)
    for (const userId of [users.other, users.pending, users.inactiveStaff, null]) {
      assert.equal(await asUser(userId, () => remove(image), userId ? 'authenticated' : 'anon'), 0)
    }
    const closedImage = await photo(users.staff, closedContactId)
    assert.equal(await asUser(users.staff, () => remove(closedImage)), 0)
    const otherBucketImage = await photo(users.other, contactId, 'unrelated-bucket', 'example.jpg')
    assert.equal(await asUser(users.leader, () => remove(otherBucketImage)), 1)
    assert.equal(await asUser(users.leader, () => remove(image)), 1)
  })
})
