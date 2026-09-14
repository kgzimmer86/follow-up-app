-- TEST ONLY: tcbwepqkvnquxkbtaxcl. Not a production migration.
-- Reference: user-provided production area configuration, September 14, 2026.
-- Preserve existing test area IDs and all references. No contact/user changes.
begin;
do $guard$
declare r record;
begin
  if not exists(select 1 from public.follow_up_campaigns
    where id='290aaf10-2d90-4b60-8768-723e6470baf4' and status='active' and label ilike '%test%') then
    raise exception 'Expected TEST campaign missing. Stop; this script is not for production.';
  end if;
  for r in select * from (values
    ('6d725d4c-4bdb-4ba9-b8bc-68280da6b993'::uuid,'test-north','north-campus','campus_region'),
    ('81cf5da1-20f0-4dae-8e85-1375c23c2e2d'::uuid,'test-central','central-campus','campus_region'),
    ('1638c4d9-c05c-4ca5-8376-9cb831d5606b'::uuid,'test-central-dorm','west-quad','dorm'),
    ('30f1aae6-e829-4a2e-849e-ce22ebf8a6ea'::uuid,'bursley','bursley','dorm')
  ) as expected(id,old_slug,new_slug,area_type) loop
    perform 1 from public.ministry_areas a where a.id=r.id
      and a.slug in (r.old_slug,r.new_slug) and a.area_type=r.area_type for update;
    if not found then raise exception 'Expected test area % changed or is missing. No changes applied.',r.old_slug; end if;
    if exists(select 1 from public.ministry_areas a where a.slug=r.new_slug and a.id<>r.id) then
      raise exception 'Duplicate destination area %. Stop and inspect before merging.',r.new_slug;
    end if;
  end loop;
end;
$guard$;

update public.ministry_areas set slug='north-campus',name='North Campus',sort_order=30,is_active=true
  where id='6d725d4c-4bdb-4ba9-b8bc-68280da6b993';
update public.ministry_areas set slug='central-campus',name='Central Campus',sort_order=10,is_active=true
  where id='81cf5da1-20f0-4dae-8e85-1375c23c2e2d';
update public.ministry_areas set slug='west-quad',name='West Quad',sort_order=10,is_active=true
  where id='1638c4d9-c05c-4ca5-8376-9cb831d5606b';

create temporary table demo_area_catalog(
  slug text primary key,name text not null,area_type text not null,parent_slug text,sort_order integer not null
) on commit drop;
insert into demo_area_catalog values
('central-campus','Central Campus','campus_region',null,10),
('the-hill','The Hill','campus_region',null,20),
('north-campus','North Campus','campus_region',null,30),
('the-village','The Village','campus_region',null,40),
('bipoc','BIPOC','affinity',null,110),
('international','International','affinity',null,120),
('south-asian-american','South Asian American','affinity',null,130),
('greek-life','Greek Life','affinity',null,140),
('village-building-1','Building 1','dorm','the-village',10),
('village-building-2','Building 2','dorm','the-village',20),
('village-building-3','Building 3','dorm','the-village',30),
('village-building-4','Building 4','dorm','the-village',40),
('harper-hall','Harper Hall','dorm','the-village',50),
('off-campus-village','Off Campus — Village','off_campus','the-village',60),
('markley','Markley','dorm','the-hill',10),
('mosher-jordan','Mosher Jordan (MoJo)','dorm','the-hill',20),
('oxford','Oxford','dorm','the-hill',30),
('alice-lloyd','Alice Lloyd','dorm','the-hill',40),
('couzens','Couzens','dorm','the-hill',50),
('stockwell','Stockwell','dorm','the-hill',60),
('off-campus-hill','Off Campus — Hill','off_campus','the-hill',70),
('west-quad','West Quad','dorm','central-campus',10),
('east-quad','East Quad','dorm','central-campus',20),
('south-quad','South Quad','dorm','central-campus',30),
('north-quad','North Quad','dorm','central-campus',40),
('fletcher','Fletcher','dorm','central-campus',50),
('betsy-barbour','Betsy Barbour','dorm','central-campus',60),
('helen-newberry','Helen Newberry','dorm','central-campus',70),
('martha-cook','Martha Cook','dorm','central-campus',80),
('munger','Munger','dorm','central-campus',90),
('off-campus-central','Off Campus — Central','off_campus','central-campus',100),
('bursley','Bursley','dorm','north-campus',10),
('baits','Baits','dorm','north-campus',20),
('northwood-apartments','Northwood Apartments','dorm','north-campus',30),
('off-campus-north','Off Campus — North','off_campus','north-campus',40);

insert into public.ministry_areas(slug,name,area_type,parent_id,is_active,sort_order)
select slug,name,area_type,null,true,sort_order from demo_area_catalog where parent_slug is null
on conflict(slug) do update set name=excluded.name,area_type=excluded.area_type,parent_id=null,
  is_active=true,sort_order=excluded.sort_order;

insert into public.ministry_areas(slug,name,area_type,parent_id,is_active,sort_order)
select d.slug,d.name,d.area_type,p.id,true,d.sort_order from demo_area_catalog d
join public.ministry_areas p on p.slug=d.parent_slug
on conflict(slug) do update set name=excluded.name,area_type=excluded.area_type,parent_id=excluded.parent_id,
  is_active=true,sort_order=excluded.sort_order;

do $verify$
begin
  if (select count(*) from demo_area_catalog)<>35 or exists(
    select 1 from demo_area_catalog d left join public.ministry_areas a on a.slug=d.slug
    left join public.ministry_areas p on p.id=a.parent_id
    where a.id is null or a.name<>d.name or a.area_type<>d.area_type or not a.is_active
      or a.sort_order<>d.sort_order or p.slug is distinct from d.parent_slug
  ) then raise exception 'Area verification failed. All changes rolled back.'; end if;
end;
$verify$;
commit;

select a.name,a.area_type,p.name as campus_area,a.is_active
from public.ministry_areas a left join public.ministry_areas p on p.id=a.parent_id
order by p.sort_order nulls first,a.sort_order,a.name;
