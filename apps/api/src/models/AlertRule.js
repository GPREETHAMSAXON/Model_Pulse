'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AlertRule = sequelize.define('AlertRule', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    model_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'models', key: 'id' },
    },
    trigger_type: {
      type: DataTypes.ENUM('drift', 'accuracy_drop', 'volume_spike', 'latency'),
      allowNull: false,
    },
    // e.g. 0.2 means fire alert when PSI > 0.2
    threshold: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    channel: {
      type: DataTypes.ENUM('email', 'slack', 'both'),
      defaultValue: 'email',
      allowNull: false,
    },
    // stored encrypted — never in plaintext at rest
    slack_webhook_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
  }, {
    tableName: 'alert_rules',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['model_id'] },
      { fields: ['enabled'] },
    ],
  });

  AlertRule.associate = (models) => {
    AlertRule.belongsTo(models.Model, { foreignKey: 'model_id' });
  };

  return AlertRule;
};
