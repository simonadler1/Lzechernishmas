-- The campaign form now takes one name, in Hebrew or English, instead of a
-- required Hebrew name and an optional English one.
ALTER TABLE campaigns RENAME COLUMN honoree_name_he TO honoree_name;
ALTER TABLE campaigns DROP COLUMN honoree_name_en;
