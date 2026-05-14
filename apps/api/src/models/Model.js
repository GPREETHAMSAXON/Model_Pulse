'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Model = sequelize.define('Model', {
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    task_type: {
      type: DataTypes.ENUM('classification', 'regression', 'other'),
      allowNull: false,
      defaultValue: 'classification',
    },
    // e.g. { "age": "float", "income": "float", "gender": "string" }
    feature_schema: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    // stores the MongoDB ObjectId string of the baseline document
    baseline_stats_id: {
      type: DataTypes.STRING(24),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('active', 'paused', 'archived'),
      defaultValue: 'active',
      allowNull: false,
    },
  }, {
    tableName: 'models',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['status'] },
    ],
  });

  Model.associate = (models) => {
    Model.belongsTo(models.User, { foreignKey: 'user_id' });
    Model.hasMany(models.ApiKey, { foreignKey: 'model_id', onDelete: 'CASCADE' });
    Model.hasMany(models.AlertRule, { foreignKey: 'model_id', onDelete: 'CASCADE' });
  };

  return Model;
};
