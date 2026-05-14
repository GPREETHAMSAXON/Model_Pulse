'use strict';

// Central Sequelize index — imports all models and sets up associations
// Usage: const { User, Model, ApiKey, AlertRule } = require('./models');

const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.POSTGRES_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

const db = {};

db.User      = require('./User')(sequelize);
db.Model     = require('./Model')(sequelize);
db.ApiKey    = require('./ApiKey')(sequelize);
db.AlertRule = require('./AlertRule')(sequelize);

// Run associations
Object.values(db).forEach((model) => {
  if (model.associate) model.associate(db);
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
