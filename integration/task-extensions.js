/* Project-owned extension point. Loaded before task/config validation.
 * Keep handlers synchronous and mutate only the supplied save object.
 * See docs/TASK_AUTHORING.md for full contracts and examples.
 */
ShopTasks.registerMetric("custom.uniqueOwned", save => Object.keys(save.collection).length);
ShopTasks.registerCondition("custom.ownsCard", (save, condition) => (save.collection[condition.cardId] || 0) >= (condition.quantity || 1));
ShopTasks.registerMetric("management.ordersCompleted",save=>window.ShopModules?.value("neighbors.completed",save,0)||0);
ShopTasks.registerMetric("management.upgradeLevels",save=>Object.values(save.modules?.upgrades?.data.levels||{}).reduce((sum,n)=>sum+n,0));
ShopTasks.registerCondition("management.upgrade",(save,condition)=>(window.ShopModules?.value("upgrades.level",save,0,{id:condition.upgradeId})||0)>=(condition.level||1));
// Example custom event objective: {type:"event", event:"custom_tournament", target:1}
// Emit from your gameplay: ShopBusiness.emit(state,"custom_tournament",{quantity:1}); store.save(state);
