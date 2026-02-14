Guidelines for this repo

- Prefer small helper functions over multi-line conditional expressions for readability.
- Use RTK Query selectFromResult to subscribe only to needed fields.
- Keep render trees shallow and avoid letting selection state re-render list containers.
