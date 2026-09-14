-- TEST DATA ONLY. Run manually in test project tcbwepqkvnquxkbtaxcl.
-- Not a production migration. Inserts 12 new fictional students/contacts and
-- five membership periods. Never updates or deletes existing records.
begin;
do $seed$
declare
  campaign public.follow_up_campaigns;
  target_group uuid;
  dorm_id uuid;
  student_id uuid;
  contact_id uuid;
  item record;
  today date := (now() at time zone 'America/Detroit')::date;
begin
  -- This is the previously verified TEST ONLY campaign, not a production year.
  select * into campaign from public.follow_up_campaigns
    where id='290aaf10-2d90-4b60-8768-723e6470baf4' and status='active'
      and label ilike '%test%';
  if not found then raise exception 'The expected TEST campaign is missing. Stop: do not change the guard to a production campaign.'; end if;
  select id into strict target_group from public.community_groups
    where campaign_id=campaign.id and lower(name)=lower('TEST North Tuesday') and is_active;
  if exists(select 1 from public.students where id::text like 'd3140001-0000-4000-8000-%'
    or umich_email ~ '^invitetest(0[1-9]|1[0-2])@example[.]invalid$') then
    raise exception 'These demo contacts already exist. No records changed; keep their current test progress.';
  end if;
  for item in select * from (values
    (1, 'Alex',   'Male',   'Bursley', '210',  'Freshman',  'yes',              'yes',   'yes',   'uncontacted',       'active'),
    (2, 'Ben',    'Male',   'Bursley', '315',  'Sophomore', 'maybe',            'maybe', 'yes',   'uncontacted',       'active'),
    (3, 'Caleb',  'Male',   'Bursley', '4210', 'Junior',    'no',               'no',    'maybe', 'uncontacted',       'active'),
    (4, 'Dylan',  'Male',   'Markley', '1204', 'Freshman',  'yes',              'yes',   'no',    'involved',          'active'),
    (5, 'Ethan',  'Male',   'Bursley', '218',  'Senior',    'already_have_one', 'yes',   'maybe', 'go_back',           'former'),
    (6, 'Finn',   'Male',   'Bursley', '322',  'Sophomore', 'maybe',            'maybe', 'no',    'attempted_contact', 'none'),
    (7, 'Grace',  'Female', 'Bursley', '410',  'Freshman',  'yes',              'yes',   'yes',   'uncontacted',       'none'),
    (8, 'Hannah', 'Female', 'Markley', '2208', 'Junior',    'maybe',            'maybe', 'maybe', 'go_back',           'none'),
    (9, 'Isaac',  'Male',   'Markley', '3212', 'Senior',    'no',               'maybe', 'yes',   'uncontacted',       'none'),
    (10,'Julia',  'Female', 'Bursley', '510',  'Sophomore', 'already_have_one', 'no',    'no',    'not_interested',    'none'),
    (11,'Kai',    'Other',  'Markley', '110',  'Freshman',  'maybe',            'yes',   'maybe', 'uncontacted',       'none'),
    (12,'Liam',   'Male',   'Markley', '425',  'Junior',    'yes',              'no',    'yes',   'uncontacted',       'none')
  ) as demo(n,first_name,gender,dorm,room,school_year,jesus,community,interview,status,membership)
  loop
    select id into strict dorm_id from public.ministry_areas
      where name=item.dorm and area_type='dorm' and is_active;
    student_id:=('d3140001-0000-4000-8000-'||lpad(item.n::text,12,'0'))::uuid;
    contact_id:=('d3140002-0000-4000-8000-'||lpad(item.n::text,12,'0'))::uuid;
    insert into public.students(id,display_name,umich_email,phone,gender_raw)
      values(student_id,'INVITE TEST '||lpad(item.n::text,2,'0')||' '||item.first_name,
        'invitetest'||lpad(item.n::text,2,'0')||'@example.invalid',
        '20255501'||lpad(item.n::text,2,'0'),item.gender);
    insert into public.follow_up_contacts(id,campaign_id,student_id,survey_submitted_at,year_at_um,gender_raw,phone,
      interview_interest,jesus_interest,community_interest,raw_location_text,ministry_location_id,
      location_resolution,room_or_address,status,contact_origin)
      values(contact_id,campaign.id,student_id,now(),item.school_year,item.gender,
        '20255501'||lpad(item.n::text,2,'0'),item.interview,item.jesus,item.community,
        item.dorm,dorm_id,'resolved',item.room,item.status,'survey');
    if item.membership<>'none' then
      insert into public.community_group_memberships(group_id,student_id,started_on,ended_on)
        values(target_group,student_id,greatest(campaign.starts_on,today-14),
          case when item.membership='former' then greatest(campaign.starts_on,today-1) else null end);
    end if;
  end loop;
end;
$seed$;
commit;

select s.display_name,c.gender_raw,a.name as dorm,c.room_or_address,
  c.jesus_interest,c.community_interest,c.interview_interest,c.status
from public.students s join public.follow_up_contacts c on c.student_id=s.id
join public.ministry_areas a on a.id=c.ministry_location_id
where s.id::text like 'd3140001-0000-4000-8000-%'
order by s.display_name;
