'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ApiKey = sequelize.define('ApiKey', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    model_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'models', key: 'id' },
    },
    // bcrypt hash of the raw key — raw key is shown once and never stored
    key_hash: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    // first 12 chars shown in UI so user can identify which key is which
    // format: mp_live_xxxx
    key_prefix: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'Default key',
    },
    last_used_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    revoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  }, {
    tableName: 'api_keys',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['model_id'] },
      { unique: true, fields: ['key_hash'] },
    ],
  });

  ApiKey.associate = (models) => {
    ApiKey.belongsTo(models.User, { foreignKey: 'user_id' });
    ApiKey.belongsTo(models.Model, { foreignKey: 'model_id' });
  };

  return ApiKey;
};
