-- Optional demo data.
--
-- Sign up in the app first, then replace the email below with your own and run
-- this in the Supabase SQL editor. The lookup keeps you from having to paste a
-- raw user id.

with account as (
  select id from auth.users where email = 'you@example.com'
)
insert into public.subscriptions
  (user_id, name, plan, category, payment_method, status, price, currency,
   billing, frequency, start_date, renewal_date, icon_key, color)
select
  account.id, v.name, v.plan, v.category, v.payment_method, v.status, v.price,
  'USD', v.billing, v.billing, v.start_date, now() + v.renews_in, v.icon_key, v.color
from account, (values
  ('Adobe Creative Cloud', 'Teams Plan',    'Design',           'Visa ending in 8530',       'active',    77.49,  'Monthly', timestamptz '2025-03-20T10:00:00Z', interval '12 days', 'adobe',   '#f5c542'),
  ('GitHub Pro',           'Developer',     'Developer Tools',  'Mastercard ending in 2408', 'active',     9.99,  'Monthly', timestamptz '2024-11-24T10:00:00Z', interval '5 days',  'github',  '#e8def8'),
  ('Claude Pro',           'Pro Plan',      'AI Tools',         'Amex ending in 1010',       'paused',    20.00,  'Monthly', timestamptz '2025-06-27T10:00:00Z', interval '18 days', 'claude',  '#b8d4e3'),
  ('Canva Pro',            'Yearly Access', 'Design',           'Visa ending in 7784',       'cancelled', 119.99, 'Yearly',  timestamptz '2024-04-02T10:00:00Z', interval '60 days', 'canva',   '#b8e8d0'),
  ('Spotify',              'Premium',       'Music',            'Visa ending in 8530',       'active',     5.99,  'Monthly', timestamptz '2025-01-11T10:00:00Z', interval '2 days',  'spotify', '#e2b6cf'),
  ('Notion',               'Plus',          'Productivity',     'Mastercard ending in 2408', 'active',    12.00,  'Monthly', timestamptz '2025-02-04T10:00:00Z', interval '4 days',  'notion',  '#95e1d3'),
  ('Figma',                'Professional',  'Design',           'Visa ending in 7784',       'active',    15.00,  'Monthly', timestamptz '2025-05-16T10:00:00Z', interval '6 days',  'figma',   '#a8d8ea')
) as v (name, plan, category, payment_method, status, price, billing, start_date, renews_in, icon_key, color);
