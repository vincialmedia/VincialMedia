-- wunch demo data (local development only)
-- 6 meals (5 rotating mains + 1 always-available dessert), one week of menu days,
-- coupons WILLKOMMEN10 and LUNCH5. Delivery slots and settings come from the migrations.
-- Photos are uploaded by `npm run db:seed-images`.

insert into public.meals
  (id, name_de, name_en, description_de, description_en, price_rappen, category, dietary_tags, allergens, sort_order, always_available, daily_portion_limit)
values
  ('11111111-1111-4111-8111-000000000001',
   'Zürcher Geschnetzeltes mit Rösti',
   'Zurich-style veal with rösti',
   'Zartes Kalbfleisch an Rahm-Champignonsauce, dazu eine knusprige Butterrösti. Der Klassiker aus Zürich, so wie er sein muss.',
   'Tender veal strips in a creamy mushroom sauce with crispy butter rösti. The Zurich classic, done properly.',
   1950, 'main', '{}', '{milk,celery,gluten}', 10, false, null),

  ('11111111-1111-4111-8111-000000000002',
   'Älplermagronen mit Apfelmus',
   'Alpine macaroni with apple sauce',
   'Hörnli, Kartoffeln, würziger Bergkäse und Rahm, mit Röstzwiebeln obendrauf. Dazu hausgemachtes Apfelmus.',
   'Macaroni, potatoes, spicy mountain cheese and cream, topped with crispy onions. With homemade apple sauce.',
   1650, 'main', '{vegetarian}', '{gluten,milk,eggs}', 20, false, null),

  ('11111111-1111-4111-8111-000000000003',
   'Grünes Thai-Curry mit Jasminreis',
   'Green Thai curry with jasmine rice',
   'Saisongemüse und Tofu in einer cremigen Kokos-Currysauce mit Thai-Basilikum und Limette. Mit Duftreis.',
   'Seasonal vegetables and tofu in a creamy coconut curry with Thai basil and lime. With jasmine rice.',
   1700, 'main', '{vegan,spicy,gluten_free,lactose_free}', '{soybeans}', 30, false, null),

  ('11111111-1111-4111-8111-000000000004',
   'Poulet-Bowl mit Quinoa und Hummus',
   'Chicken bowl with quinoa and hummus',
   'Grilliertes Schweizer Poulet auf Quinoa, Ofengemüse, Hummus und knackigem Salat. Mit Zitronen-Tahini-Dressing.',
   'Grilled Swiss chicken on quinoa with roasted vegetables, hummus and crunchy greens. With lemon tahini dressing.',
   1800, 'main', '{gluten_free,lactose_free}', '{sesame}', 40, false, null),

  ('11111111-1111-4111-8111-000000000005',
   'Randen-Risotto mit Ziegenkäse',
   'Beetroot risotto with goat cheese',
   'Cremiges Risotto mit Randen aus dem Knonauer Amt, Ziegenfrischkäse, Baumnüssen und frischem Thymian.',
   'Creamy risotto with local beetroot, fresh goat cheese, walnuts and fresh thyme.',
   1750, 'main', '{vegetarian,gluten_free}', '{milk,nuts,celery,sulphites}', 50, false, null),

  ('11111111-1111-4111-8111-000000000006',
   'Schoggimousse',
   'Chocolate mousse',
   'Luftige Mousse aus dunkler Schweizer Schokolade mit einem Hauch Fleur de Sel.',
   'Airy mousse made with dark Swiss chocolate and a pinch of fleur de sel.',
   650, 'dessert', '{vegetarian,gluten_free}', '{milk,eggs}', 90, true, 20);

-- One week of menu: every delivery weekday, three of the five mains rotate.
with days as (
  select d::date as menu_date, row_number() over (order by d) - 1 as i
  from generate_series(
    (now() at time zone 'Europe/Zurich')::date,
    (now() at time zone 'Europe/Zurich')::date + 7,
    interval '1 day'
  ) d
  where extract(isodow from d) between 1 and 5
),
mains as (
  select id, row_number() over (order by sort_order) - 1 as k
  from public.meals
  where category = 'main'
)
insert into public.menu_days (menu_date, meal_id, portion_limit)
select days.menu_date, mains.id, 15
from days
cross join mains
where ((mains.k - days.i) % 5 + 5) % 5 in (0, 1, 2);

insert into public.coupons (code, kind, percent_off, amount_off_rappen) values
  ('WILLKOMMEN10', 'percent', 10, null),
  ('LUNCH5', 'fixed', null, 500);
