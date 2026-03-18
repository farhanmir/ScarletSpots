INSERT INTO applications (id, name, description, type, is_admin_api, created_at) 
VALUES (
  gen_random_uuid(),
  'ScarletSpots Backend',
  'M2M for user management',
  'MachineToMachine',
  false,
  now()
) RETURNING id, name, type;
