# AssetTrack

AssetTrack is a small full-stack IT asset management project for tracking company laptops, monitors, phones and other equipment.

I built it as a practical project to work with JavaScript, Node.js, SQL and basic front-end development. The goal was to model a simple internal IT workflow instead of building another general-purpose demo app.

## Features

- View a dashboard of total, assigned, available and repair assets
- Add, edit and delete company assets
- Assign equipment to employees
- Search assets by tag, model, serial number or employee
- Filter by asset type and status
- Track purchase and warranty dates
- Flag warranties ending within 90 days
- Add maintenance and repair records
- Store data in a SQLite relational database

## Technologies i used

- Node.js
- Express
- SQLite
- JavaScript
- HTML
- CSS
- Git

## Database

The project uses three tables:

- `employees`
- `assets`
- `maintenance_records`

An asset can be assigned to one employee, and an asset can have multiple maintenance records.

## Run locally

1. Install Node.js.
2. Open a terminal in the project folder.
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm start
```

5. Open:

```text
http://localhost:3000
```

The SQLite database is created automatically the first time the server runs. A few sample assets and employees are also added so the interface is not empty.

## Main API routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/dashboard` | Dashboard totals |
| GET | `/api/assets` | List/search/filter assets |
| GET | `/api/assets/:id` | Asset and maintenance details |
| POST | `/api/assets` | Add an asset |
| PUT | `/api/assets/:id` | Update an asset |
| DELETE | `/api/assets/:id` | Delete an asset |
| GET | `/api/employees` | List employees |
| POST | `/api/assets/:id/maintenance` | Add maintenance record |

## My future plans

This is intentionally a manageable first version. Future improvements could include:

- User login and permissions
- CSV export
- Employee management page
- Asset checkout/return history
- Better automated tests
- Deployment to a cloud service

## Project structure

```text
assettrack/
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── .gitignore
├── db.js
├── package.json
├── README.md
├── schema.sql
└── server.js
```
