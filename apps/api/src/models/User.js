'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    password_hash: {
      type: DataTypes.TEXT,
      allowNull: true, // null for OAuth-only users
    },
    google_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },
    plan: {
      type: DataTypes.ENUM('hobby', 'pro', 'team'),
      defaultValue: 'hobby',
      allowNull: false,
    },
    stripe_customer_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  }, {
    tableName: 'users',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  User.associate = (models) => {
    User.hasMany(models.Model, { foreignKey: 'user_id', onDelete: 'CASCADE' });
    User.hasMany(models.ApiKey, { foreignKey: 'user_id', onDelete: 'CASCADE' });
  };

  return User;
};
