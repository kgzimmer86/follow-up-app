-- Columns and constraints reconstructed from the user's read-only schema export.
create table public.follow_up_campaigns (academic_year text not null,
label text not null,
starts_on date not null,
id uuid not null default gen_random_uuid(),
ends_on date not null,
status text not null default 'draft'::text,
archived_at timestamptz,
purge_after date,
created_by uuid,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now());
create table public.follow_up_contacts (id uuid not null default gen_random_uuid(),
campaign_id uuid not null,
student_id uuid not null,
survey_submitted_at timestamptz,
year_at_um text,
gender_raw text,
phone text,
interview_interest text,
jesus_interest text,
community_interest text,
raw_location_text text,
ministry_location_id uuid,
location_resolution text not null default 'resolved'::text,
room_or_address text,
house_name text,
status text not null default 'uncontacted'::text,
primary_owner_id uuid,
first_interaction_at timestamptz,
last_interaction_at timestamptz,
last_knock_at timestamptz,
knock_count int4 not null default 0,
interview_completed_at timestamptz,
kgp_shared_at timestamptz,
received_christ_at timestamptz,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
coaching_correction_exempt_owner_id uuid,
coaching_correction_exempt_at timestamptz,
contact_origin text not null default 'survey'::text,
field_added_by uuid,
field_added_from_contact_id uuid,
field_added_relationship text,
primary_assigned_at timestamptz,
primary_assigned_by uuid,
cg_text_invite_only bool not null default false);
create table public.ministry_areas (id uuid not null default gen_random_uuid(),
slug text not null,
name text not null,
area_type text not null,
parent_id uuid,
is_active bool not null default true,
sort_order int4 not null default 0,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now());
create table public.profile_ministry_area_assignments (id uuid not null default gen_random_uuid(),
campaign_id uuid not null,
profile_id uuid not null,
ministry_area_id uuid not null,
is_default bool not null default false,
created_by uuid,
created_at timestamptz not null default now());
create table public.profiles (id uuid not null,
display_name text,
email text,
avatar_url text,
role text not null default 'pending'::text,
is_active bool not null default true,
access_requested_at timestamptz not null default now(),
approved_at timestamptz,
approved_by uuid,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now());
create table public.students (display_name text not null,
id uuid not null default gen_random_uuid(),
uniqname text,
umich_email text,
phone text,
gender_raw text,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now());
create table public.survey_import_rows (id uuid not null default gen_random_uuid(),
import_id uuid not null,
row_number int4 not null,
raw_data jsonb not null,
normalized_data jsonb,
issues jsonb not null default '[]'::jsonb,
resolution_status text not null default 'pending'::text,
follow_up_contact_id uuid,
created_at timestamptz not null default now());
create table public.survey_imports (id uuid not null default gen_random_uuid(),
campaign_id uuid not null,
filename text not null,
source_kind text not null default 'xlsx'::text,
status text not null default 'uploaded'::text,
source_headers jsonb not null default '[]'::jsonb,
total_rows int4 not null default 0,
imported_rows int4 not null default 0,
issue_rows int4 not null default 0,
imported_by uuid);
alter table public.follow_up_campaigns add constraint follow_up_campaigns_pkey PRIMARY KEY (id);
alter table public.follow_up_contacts add constraint follow_up_contacts_pkey PRIMARY KEY (id);
alter table public.ministry_areas add constraint ministry_areas_pkey PRIMARY KEY (id);
alter table public.profile_ministry_area_assignments add constraint profile_ministry_area_assignments_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.students add constraint students_pkey PRIMARY KEY (id);
alter table public.follow_up_campaigns add constraint follow_up_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.follow_up_campaigns add constraint follow_up_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])));
alter table public.follow_up_campaigns add constraint follow_up_campaigns_academic_year_key UNIQUE (academic_year);
alter table public.follow_up_campaigns add constraint follow_up_campaigns_check CHECK ((ends_on >= starts_on));
alter table public.follow_up_contacts add constraint follow_up_contacts_status_check CHECK ((status = ANY (ARRAY['uncontacted'::text, 'attempted_contact'::text, 'go_back'::text, 'involved'::text, 'not_interested'::text])));
alter table public.follow_up_contacts add constraint follow_up_contacts_primary_owner_id_fkey FOREIGN KEY (primary_owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.follow_up_contacts add constraint follow_up_contacts_origin_check CHECK ((contact_origin = ANY (ARRAY['survey'::text, 'field_added'::text])));
alter table public.follow_up_contacts add constraint follow_up_contacts_ministry_location_id_fkey FOREIGN KEY (ministry_location_id) REFERENCES ministry_areas(id) ON DELETE RESTRICT;
alter table public.follow_up_contacts add constraint follow_up_contacts_location_resolution_check CHECK ((location_resolution = ANY (ARRAY['resolved'::text, 'needs_area_assignment'::text, 'no_address'::text])));
alter table public.follow_up_contacts add constraint follow_up_contacts_knock_count_check CHECK ((knock_count >= 0));
alter table public.follow_up_contacts add constraint follow_up_contacts_jesus_interest_check CHECK (((jesus_interest IS NULL) OR (jesus_interest = ANY (ARRAY['yes'::text, 'no'::text, 'maybe'::text, 'already_have_one'::text]))));
alter table public.follow_up_contacts add constraint follow_up_contacts_interview_interest_check CHECK (((interview_interest IS NULL) OR (interview_interest = ANY (ARRAY['yes'::text, 'no'::text, 'maybe'::text]))));
alter table public.follow_up_contacts add constraint follow_up_contacts_field_added_from_fk FOREIGN KEY (field_added_from_contact_id) REFERENCES follow_up_contacts(id) ON DELETE SET NULL;
alter table public.follow_up_contacts add constraint follow_up_contacts_campaign_id_student_id_key UNIQUE (campaign_id, student_id);
alter table public.follow_up_contacts add constraint follow_up_contacts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES follow_up_campaigns(id) ON DELETE CASCADE;
alter table public.follow_up_contacts add constraint follow_up_contacts_coaching_correction_owner_fk FOREIGN KEY (coaching_correction_exempt_owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.follow_up_contacts add constraint follow_up_contacts_community_interest_check CHECK (((community_interest IS NULL) OR (community_interest = ANY (ARRAY['yes'::text, 'no'::text, 'maybe'::text]))));
alter table public.follow_up_contacts add constraint follow_up_contacts_field_added_by_fk FOREIGN KEY (field_added_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.follow_up_contacts add constraint follow_up_contacts_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
alter table public.ministry_areas add constraint ministry_areas_slug_key UNIQUE (slug);
alter table public.ministry_areas add constraint ministry_areas_area_type_check CHECK ((area_type = ANY (ARRAY['campus_region'::text, 'dorm'::text, 'off_campus'::text, 'affinity'::text])));
alter table public.ministry_areas add constraint ministry_areas_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES ministry_areas(id) ON DELETE RESTRICT;
alter table public.profile_ministry_area_assignments add constraint profile_ministry_area_assignm_campaign_id_profile_id_minist_key UNIQUE (campaign_id, profile_id, ministry_area_id);
alter table public.profile_ministry_area_assignments add constraint profile_ministry_area_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.profile_ministry_area_assignments add constraint profile_ministry_area_assignments_ministry_area_id_fkey FOREIGN KEY (ministry_area_id) REFERENCES ministry_areas(id) ON DELETE RESTRICT;
alter table public.profile_ministry_area_assignments add constraint profile_ministry_area_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.profile_ministry_area_assignments add constraint profile_ministry_area_assignments_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES follow_up_campaigns(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['pending'::text, 'student_leader'::text, 'discipler'::text, 'staff'::text, 'admin'::text])));
