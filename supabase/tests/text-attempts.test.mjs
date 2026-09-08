// Runs only in a new, in-memory PostgreSQL database with invented contacts.
// Install @electric-sql/pglite in a temporary directory and set
// FOLLOW_UP_PGLITE_MODULE to its dist/index.js path to run without app dependencies.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')
const sql = await readFile(new URL('../migrations/20260908_text_attempts.sql', import.meta.url), 'utf8')
const resultsSql = await readFile(new URL('../migrations/20260907_contact_filter_area_context.sql', import.meta.url), 'utf8')
const homeSql = await readFile(new URL('../migrations/20260908_home_invited_flag.sql', import.meta.url), 'utf8')

test('text attempt migration and database behavior', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  // The existing private insert routines are represented by dispatch spies.
  // This verifies the migration preserves their invocation for old event types
  // and never sends text attempts through routines whose bodies it does not alter.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
    create table profiles (id uuid primary key, display_name text, is_active boolean, role text);
    create function private.is_approved_user() returns boolean language sql security definer as
      $$ select exists(select 1 from public.profiles where id = auth.uid() and is_active and role <> 'pending') $$;
    create table follow_up_campaigns (id uuid primary key, label text, status text);
    create table students (id uuid primary key, display_name text, uniqname text, umich_email text);
    create table ministry_areas (id uuid primary key, name text, area_type text, parent_id uuid, is_active boolean);
    create table profile_ministry_area_assignments (profile_id uuid, ministry_area_id uuid, campaign_id uuid, is_default boolean);
    create table follow_up_contact_affinities (contact_id uuid, ministry_area_id uuid);
    create table follow_up_contacts (
      id uuid primary key, student_id uuid, campaign_id uuid, ministry_location_id uuid, primary_owner_id uuid,
      year_at_um text, gender_raw text, phone text, jesus_interest text, community_interest text, interview_interest text,
      house_name text, room_or_address text, location_resolution text default 'resolved', status text default 'uncontacted',
      knock_count integer default 0, last_knock_at timestamptz, first_interaction_at timestamptz, last_interaction_at timestamptz,
      interview_completed_at timestamptz, kgp_shared_at timestamptz, received_christ_at timestamptz,
      coaching_correction_exempt_owner_id uuid, coaching_correction_exempt_at timestamptz, updated_at timestamptz
    );
    create table follow_up_events (
      id uuid primary key default gen_random_uuid(), contact_id uuid not null references follow_up_contacts(id),
      performed_by uuid references profiles(id), performed_by_name text, event_type text not null,
      occurred_at timestamptz not null default now(), created_at timestamptz not null default now(), notes text,
      contact_method text, knock_outcome text, status_after text,
      found_home boolean not null default false, had_spiritual_conversation boolean not null default false,
      interview_completed boolean not null default false, kgp_shared boolean not null default false,
      received_christ boolean not null default false, invited_to_community_group boolean not null default false,
      constraint follow_up_events_event_type_check check(event_type in ('knock','interaction')),
      constraint follow_up_events_check check(
        (event_type = 'knock' and knock_outcome is not null and not had_spiritual_conversation and not interview_completed
          and not kgp_shared and not received_christ and not invited_to_community_group)
        or (event_type = 'interaction' and knock_outcome is null))
    );
    create table legacy_trigger_calls (name text, event_type text);
    create function private.validate_follow_up_event() returns trigger language plpgsql as $$ begin
      insert into public.legacy_trigger_calls values ('validate',new.event_type); return new; end $$;
    create function private.apply_follow_up_event() returns trigger language plpgsql as $$ begin
      insert into public.legacy_trigger_calls values ('apply',new.event_type); return new; end $$;
    create function private.clear_follow_up_coaching_correction_on_new_event() returns trigger language plpgsql as $$ begin
      insert into public.legacy_trigger_calls values ('clear',new.event_type); return new; end $$;
    create trigger validate_follow_up_event_before_insert before insert on follow_up_events
      for each row execute function private.validate_follow_up_event();
    create trigger apply_follow_up_event_after_insert after insert on follow_up_events
      for each row execute function private.apply_follow_up_event();
    create trigger follow_up_clear_coaching_correction_on_new_event after insert on follow_up_events
      for each row execute function private.clear_follow_up_coaching_correction_on_new_event();
    create function private.recalculate_follow_up_contact_progress(p_contact_id uuid) returns void language sql set search_path to 'public' as $$
      update follow_up_contacts c set
        knock_count=(select count(*) from follow_up_events where contact_id=c.id and event_type='knock'),
        last_knock_at=(select max(occurred_at) from follow_up_events where contact_id=c.id and event_type='knock'),
        kgp_shared_at=(select min(occurred_at) from follow_up_events where contact_id=c.id and event_type='interaction' and kgp_shared),
        interview_completed_at=(select min(occurred_at) from follow_up_events where contact_id=c.id and event_type='interaction' and interview_completed),
        received_christ_at=(select min(occurred_at) from follow_up_events where contact_id=c.id and event_type='interaction' and received_christ)
      where c.id=p_contact_id $$;
    create function public.set_follow_up_contact_status(p_contact_id uuid,p_status text) returns void language sql as
      $$ update public.follow_up_contacts set status=p_status where id=p_contact_id $$;
  `)
  const leader = randomUUID(), otherLeader = randomUUID(), staff = randomUUID(), inactive = randomUUID(), pending = randomUUID()
  const campaign = randomUUID(), closedCampaign = randomUUID()
  for (const [id, role, active] of [[leader,'student_leader',true],[otherLeader,'student_leader',true],[staff,'staff',true],[inactive,'staff',false],[pending,'pending',true]]) {
    await db.query('insert into profiles values ($1,$2,$3,$4)',[id,'Example Leader',active,role])
  }
  await db.query('insert into follow_up_campaigns values ($1,$2,$3),($4,$5,$6)',[campaign,'Test campaign','active',closedCampaign,'Closed test','closed'])
  const asUser = (id) => db.query("select set_config('test.user_id',$1,false)",[id ?? ''])
  await asUser(leader)
  async function contact(status='uncontacted', selectedCampaign=campaign, owner=null) {
    const id=randomUUID(), studentId=randomUUID()
    await db.query('insert into students(id,display_name) values ($1,$2)',[studentId,'Example Student'])
    await db.query("insert into follow_up_contacts(id,student_id,campaign_id,status,primary_owner_id,jesus_interest,interview_interest,community_interest) values ($1,$2,$3,$4,$5,'yes','yes','yes')",[id,studentId,selectedCampaign,status,owner])
    return id
  }
  async function log(id, purposes=['invite_cg'], eventName=null, notes=null, eventId=randomUUID()) {
    await db.query('select log_text_attempt($1,$2,$3,$4,$5)',[eventId,id,purposes,eventName,notes])
    return eventId
  }
  const row = async (id) => (await db.query('select * from follow_up_contacts where id=$1',[id])).rows[0]
  const events = async (id) => (await db.query('select * from follow_up_events where contact_id=$1 order by occurred_at desc',[id])).rows
  const view = async (name) => (await db.query('select get_follow_up_contact_results_v2($1) as result',[name])).rows[0].result
  const remove = (id, unassign=false) => db.query('select delete_follow_up_event($1,$2)',[id,unassign])
  const update = (id, purposes, eventName=null, notes=null) => db.query('select update_text_attempt($1,$2,$3,$4,$5)',[id,'2026-09-08T14:00:00Z',purposes,eventName,notes])
  const legacyEvent = async (id,type,extra={}) => {
    const eventId=randomUUID()
    await db.query("insert into follow_up_events(id,contact_id,performed_by,event_type,knock_outcome,notes,invited_to_community_group,occurred_at) values ($1,$2,$3,$4,$5,$6,$7,now()-interval '1 minute')",[eventId,id,leader,type,type==='knock'?'no_answer':null,extra.notes??null,extra.invited??false])
    return eventId
  }

  await db.exec(resultsSql)
  const baselineContact=await contact()
  const baseline=await view('new')
  await t.test('complete migration runs successfully and can be reapplied', async () => {
    await db.exec(sql)
    await db.exec(sql)
    const after=await view('new')
    for (const item of after.rows) delete item.latest_text_attempt
    assert.deepEqual(after,baseline)
  })
  await db.exec(homeSql)

  await t.test('sending a text changes only Uncontacted to Attempted Contact', async () => {
    for (const status of ['uncontacted','attempted_contact','go_back','involved','not_interested']) {
      const id=await contact(status,campaign,leader)
      await log(id)
      const result=await row(id)
      assert.equal(result.status,status==='uncontacted'?'attempted_contact':status)
      assert.equal(result.primary_owner_id,leader)
      assert.equal(result.last_interaction_at,null)
      assert.equal(result.first_interaction_at,null)
      assert.equal(result.knock_count,0)
      assert.equal(result.kgp_shared_at,null)
    }
  })
  await t.test('CG invitation texts remain in Meet Someone New and do not mark Invited to CG', async () => {
    const id=await contact()
    await log(id,['invite_cg','appointment'],null,'Asked about Thursday')
    const item=(await view('new')).rows.find((item)=>item.id===id)
    assert.ok(item)
    assert.equal(item.invited_to_community_group,false)
    assert.equal(item.interaction_count,0)
    assert.deepEqual(item.interaction_notes,[])
    assert.deepEqual(item.latest_text_attempt.text_purposes,['invite_cg','appointment'])
    assert.ok(!(await view('goback')).rows.some((item)=>item.id===id))
  })
  await t.test('custom events and latest text appear without replacing meaningful notes', async () => {
    const id=await contact('go_back')
    await legacyEvent(id,'interaction',{notes:'Meaningful conversation',invited:true})
    await log(id,['invite_event'],'Barn Bash','Offered a ride')
    const item=(await view('goback')).rows.find((item)=>item.id===id)
    assert.equal(item.invited_to_community_group,true)
    assert.equal(item.interaction_notes[0].notes,'Meaningful conversation')
    assert.equal(item.latest_text_attempt.text_event_name,'Barn Bash')
    const home=(await db.query('select get_follow_up_home_dashboard() as result')).rows[0].result
    const recent=home.recent_contacts.find((item)=>item.id===id)
    assert.equal(recent.latest_event_type,'text_attempt')
    assert.equal(recent.recent_notes[0].notes,'Meaningful conversation')
  })
  await t.test('retrying a saved text is idempotent, and cannot reuse another event', async () => {
    const id=await contact(), eventId=randomUUID()
    await log(id,['invite_cg'],null,null,eventId)
    await log(id,['invite_cg'],null,null,eventId)
    assert.equal((await events(id)).length,1)
    await asUser(otherLeader)
    await assert.rejects(log(id,['invite_cg'],null,null,eventId),/already in use/)
    await asUser(leader)
  })
  await t.test('invalid purpose, missing event name, or oversized note never saves or changes status', async () => {
    const id=await contact()
    for (const purposes of [[],['invalid'],[null],null]) await assert.rejects(log(id,purposes))
    await assert.rejects(log(id,['invite_event'],'   '))
    await assert.rejects(log(id,['follow_up'],null,'x'.repeat(2001)))
    assert.equal((await row(id)).status,'uncontacted')
    assert.equal((await events(id)).length,0)
  })
  await t.test('text attempts cannot carry ministry completion flags or found-home observations', async () => {
    const id=await contact()
    for (const flag of ['invited_to_community_group','kgp_shared','interview_completed','received_christ','had_spiritual_conversation','found_home']) {
      await assert.rejects(db.query(`insert into follow_up_events(contact_id,performed_by,event_type,contact_method,text_purposes,${flag}) values ($1,$2,'text_attempt','text',array['invite_cg'],true)`,[id,leader]))
    }
    assert.equal((await events(id)).length,0)
  })
  await t.test('signed-out, inactive, pending users and closed campaigns cannot log texts', async () => {
    const id=await contact()
    for (const user of [null,inactive,pending]) { await asUser(user); await assert.rejects(log(id),/access is required/) }
    await asUser(leader)
    await assert.rejects(log(await contact('uncontacted',closedCampaign)),/active Follow Up campaign/)
  })
  await t.test('only the recorder or staff can edit or delete text attempts', async () => {
    const id=await contact(), eventId=await log(id)
    await asUser(otherLeader)
    await assert.rejects(update(eventId,['follow_up']),/only edit history/)
    await assert.rejects(remove(eventId),/only delete history/)
    await asUser(staff)
    await update(eventId,['invite_event'],'Fall Getaway','Updated note')
    assert.equal((await events(id))[0].text_event_name,'Fall Getaway')
    await remove(eventId)
    assert.equal((await events(id)).length,0)
    await asUser(leader)
  })
  await t.test('deleting the only text resets Attempted Contact but preserves other statuses and ownership', async () => {
    for (const status of ['uncontacted','go_back','involved','not_interested']) {
      const id=await contact(status,campaign,leader), eventId=await log(id)
      await assert.rejects(remove(eventId,true),/cannot be used to clear/)
      await remove(eventId)
      assert.equal((await row(id)).status,status)
      assert.equal((await row(id)).primary_owner_id,leader)
    }
  })
  await t.test('remaining texts or knocks keep Attempted Contact after deletion', async () => {
    const id=await contact(), first=await log(id), second=await log(id,['appointment'])
    await remove(second)
    assert.equal((await row(id)).status,'attempted_contact')
    const knock=await legacyEvent(id,'knock')
    await remove(first)
    assert.equal((await row(id)).status,'attempted_contact')
    await remove(knock)
    assert.equal((await row(id)).status,'uncontacted')
  })
  await t.test('deleting an interaction with a remaining text restores Attempted Contact and unchecks CG', async () => {
    const id=await contact('go_back'), interaction=await legacyEvent(id,'interaction',{invited:true})
    await log(id)
    await remove(interaction)
    assert.equal((await row(id)).status,'attempted_contact')
    const item=(await view('new')).rows.find((item)=>item.id===id)
    assert.equal(item.invited_to_community_group,false)
    assert.equal(item.interaction_count,0)
  })
  await t.test('deleting or editing text changes the latest text without affecting the latest interaction', async () => {
    const id=await contact('go_back')
    await legacyEvent(id,'interaction',{notes:'Keep this conversation'})
    const first=await log(id,['invite_cg']), second=await log(id,['appointment'])
    await remove(second)
    let item=(await view('goback')).rows.find((item)=>item.id===id)
    assert.deepEqual(item.latest_text_attempt.text_purposes,['invite_cg'])
    await update(first,['invite_acg'])
    item=(await view('goback')).rows.find((item)=>item.id===id)
    assert.deepEqual(item.latest_text_attempt.text_purposes,['invite_acg'])
    assert.equal(item.interaction_notes[0].notes,'Keep this conversation')
  })
  await t.test('legacy insert routines are still called for knocks/interactions and never for texts', async () => {
    await legacyEvent(baselineContact,'knock')
    await legacyEvent(baselineContact,'interaction')
    const calls=(await db.query('select distinct name,event_type from legacy_trigger_calls')).rows
    assert.equal(calls.length,6)
    assert.ok(calls.every((call)=>['knock','interaction'].includes(call.event_type)))
  })
})
