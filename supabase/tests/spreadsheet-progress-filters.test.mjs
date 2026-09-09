// Uses only invented contacts in an in-memory PostgreSQL database.
// Set FOLLOW_UP_PGLITE_MODULE to a temporary install's dist/index.js to run.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')
const previousSql = await readFile(new URL('../migrations/20260909_spreadsheet_column_filters.sql', import.meta.url), 'utf8')
const sql = await readFile(new URL('../migrations/20260909_spreadsheet_progress_filters.sql', import.meta.url), 'utf8')

test('spreadsheet progress filters preserve existing results and filter before pagination', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
    create table profiles (id uuid primary key, display_name text, is_active boolean, role text);
    create table follow_up_campaigns (id uuid primary key, label text, status text);
    create table students (id uuid primary key, display_name text, uniqname text, umich_email text);
    create table ministry_areas (id uuid primary key, name text, area_type text, parent_id uuid, is_active boolean);
    create table profile_ministry_area_assignments (profile_id uuid, ministry_area_id uuid, campaign_id uuid, is_default boolean);
    create table follow_up_contact_affinities (contact_id uuid, ministry_area_id uuid);
    create table follow_up_contacts (
      id uuid primary key, student_id uuid, campaign_id uuid, ministry_location_id uuid, primary_owner_id uuid,
      year_at_um text, gender_raw text, phone text, jesus_interest text, community_interest text, interview_interest text,
      house_name text, room_or_address text, location_resolution text, status text, knock_count integer,
      last_knock_at timestamptz, interview_completed_at timestamptz, kgp_shared_at timestamptz, received_christ_at timestamptz
    );
    create table follow_up_events (
      id uuid primary key, contact_id uuid, performed_by uuid, event_type text, occurred_at timestamptz,
      created_at timestamptz, notes text, invited_to_community_group boolean, text_purposes text[], text_event_name text
    );
  `)
  const user = randomUUID(), campaign = randomUUID(), inactiveCampaign = randomUUID()
  await db.query("insert into profiles values ($1, 'Example staff', true, 'staff')", [user])
  await db.query("select set_config('test.user_id', $1, false)", [user])
  await db.query("insert into follow_up_campaigns values ($1, 'Current', 'active'), ($2, 'Past', 'closed')", [campaign, inactiveCampaign])

  const contacts = []
  // Each flag varies independently; each Yes/No set exceeds a 50-contact page.
  for (let i = 0; i < 128; i++) {
    const id = randomUUID(), studentId = randomUUID()
    const item = { id, kgp: Boolean(i & 1), interview: Boolean(i & 2), believer: Boolean(i & 4) }
    contacts.push(item)
    await db.query('insert into students values ($1, $2, null, $3)', [studentId, `Example ${String(i).padStart(3, '0')}`, i % 2 ? 'example@example.invalid' : null])
    await db.query(`insert into follow_up_contacts (
      id, student_id, campaign_id, primary_owner_id, gender_raw, jesus_interest, community_interest, interview_interest,
      location_resolution, status, kgp_shared_at, interview_completed_at, received_christ_at
    ) values ($1, $2, $3, $4, 'male', 'yes', 'yes', 'yes', 'no_address', 'go_back', $5, $6, $7)`,
    [id, studentId, campaign, user, item.kgp ? '2026-09-08T12:00:00Z' : null,
      item.interview ? '2026-09-08T12:00:00Z' : null, item.believer ? '2026-09-08T12:00:00Z' : null])
    if (i % 3 === 0) {
      await db.query(`insert into follow_up_events values ($1,$2,$3,'text_attempt',now(),now(),null,false,array['invite_cg'],null)`, [randomUUID(), id, user])
    }
    if (i % 5 === 0) {
      await db.query(`insert into follow_up_events values ($1,$2,$3,'interaction',now(),now(),'Example note',true,null,null)`, [randomUUID(), id, user])
    }
  }
  // Exclude records from old campaigns, even when all flags are Yes.
  await db.query(`insert into follow_up_contacts (id, student_id, campaign_id, kgp_shared_at, interview_completed_at, received_christ_at)
    select $1, student_id, $2, now(), now(), now() from follow_up_contacts limit 1`, [randomUUID(), inactiveCampaign])

  const results = async (params = {}) => {
    const entries = Object.entries({ p_view: 'area', ...params })
    const args = entries.map(([key], i) => `${key} => $${i + 1}`).join(', ')
    return (await db.query(`select get_follow_up_contact_results_v2(${args}) as result`, entries.map(([, value]) => value))).rows[0].result
  }
  await db.exec(previousSql)
  const oldQueries = [
    ...['area', 'mine', 'goback', 'gospel', 'new', 'cg', 'noaddress'].map((p_view) => ({ p_view })),
    { p_spreadsheet_text_cg: 'yes' }, { p_spreadsheet_text_cg: 'no' },
    { p_spreadsheet_invited_cg: 'yes' }, { p_spreadsheet_email: 'missing' },
    { p_kgp: 'shared', p_interview_done: 'not_completed', p_page: 2 },
  ]
  const baseline = await Promise.all(oldQueries.map(results))
  await t.test('full migration runs, can be reapplied, and keeps legacy calls identical', async () => {
    await db.exec(sql)
    await db.exec(sql)
    assert.deepEqual(await Promise.all(oldQueries.map(results)), baseline)
    const signatures = await db.query("select pronargs from pg_proc where proname='get_follow_up_contact_results_v2'")
    assert.deepEqual(signatures.rows, [{ pronargs: 30 }])
  })

  for (const [param, flag] of [
    ['p_spreadsheet_kgp_shared', 'kgp'],
    ['p_spreadsheet_interview_complete', 'interview'],
    ['p_spreadsheet_new_believer', 'believer'],
  ]) {
    await t.test(`${flag}: Any, Yes, No and both pages match the column values`, async () => {
      for (const choice of [null, '', 'yes', 'no']) {
        const expected = contacts.filter((item) => !choice || item[flag] === (choice === 'yes'))
        const found = []
        for (let page = 1; page <= Math.ceil(expected.length / 50); page++) {
          const result = await results({ [param]: choice, p_page: page })
          assert.equal(result.total_count, expected.length)
          found.push(...result.rows.map((item) => item.id))
        }
        assert.deepEqual(found, expected.map((item) => item.id))
      }
    })
  }

  await t.test('new choices intersect each other, personal filters and smart-card criteria', async () => {
    const combined = await results({ p_spreadsheet_kgp_shared: 'yes', p_spreadsheet_interview_complete: 'no', p_spreadsheet_new_believer: 'yes' })
    assert.deepEqual(combined.rows.map((item) => item.id), contacts.filter((item) => item.kgp && !item.interview && item.believer).map((item) => item.id))
    for (const params of [
      { p_view: 'gospel', p_spreadsheet_kgp_shared: 'yes' },
      { p_kgp: 'not_shared', p_spreadsheet_kgp_shared: 'yes' },
      { p_interview_done: 'completed', p_spreadsheet_interview_complete: 'no' },
    ]) {
      const result = await results(params)
      assert.equal(result.total_count, 0)
      assert.deepEqual(result.rows, [])
    }
    const texts = await results({ p_spreadsheet_text_cg: 'yes', p_spreadsheet_new_believer: 'yes' })
    assert.deepEqual(texts.rows.map((item) => item.id), contacts.filter((item, i) => i % 3 === 0 && item.believer).map((item) => item.id))
  })

  await t.test('returning a completion date to null moves the contact from Yes to No', async () => {
    const item = contacts[7]
    await db.query('update follow_up_contacts set kgp_shared_at=null, interview_completed_at=null, received_christ_at=null where id=$1', [item.id])
    for (const param of ['p_spreadsheet_kgp_shared', 'p_spreadsheet_interview_complete', 'p_spreadsheet_new_believer']) {
      const yes = await results({ [param]: 'yes', p_page_size: 100 })
      const no = await results({ [param]: 'no', p_page_size: 100 })
      assert.ok(!yes.rows.some((row) => row.id === item.id))
      assert.ok(no.rows.some((row) => row.id === item.id))
    }
  })

  await t.test('execution privileges and access checks remain enforced', async () => {
    const definition = await db.query("select oid::regprocedure::text as signature from pg_proc where proname='get_follow_up_contact_results_v2'")
    const signature = definition.rows[0].signature
    const privileges = await db.query("select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authenticated", [signature])
    assert.deepEqual(privileges.rows[0], { anon: false, authenticated: true })
    await db.query("select set_config('test.user_id', '', false)")
    await assert.rejects(results({ p_spreadsheet_new_believer: 'yes' }), /signed in/)
    await db.query("select set_config('test.user_id', $1, false)", [user])
    await db.query('update profiles set is_active=false where id=$1', [user])
    await assert.rejects(results({ p_spreadsheet_kgp_shared: 'no' }), /Active Follow Up access/)
  })
})
