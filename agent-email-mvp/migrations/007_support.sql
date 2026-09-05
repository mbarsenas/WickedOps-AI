CREATE TABLE IF NOT EXISTS support_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL,requester_email text NOT NULL,
 category text NOT NULL,subject text NOT NULL,message text NOT NULL,
 status text NOT NULL DEFAULT 'open',reply text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,slot integer NOT NULL CHECK(slot BETWEEN 1 AND 5),
 UNIQUE(requester_email,request_id),UNIQUE(requester_email,day,slot)
);
