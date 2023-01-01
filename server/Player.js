/**
 * Created by Jerome on 20-09-17.
 */

// var PersonalUpdatePacket = require('./PersonalUpdatePacket.js').PersonalUpdatePacket;
// var Stats = require('../shared/Stats.js').Stats;
// var StatsContainer = require('../shared/Stats.js').StatsContainer;
// var Equipment = require('../shared/Equipment.js').Equipment;
// var EquipmentManager = require('../shared/Equipment.js').EquipmentManager;
import PersonalUpdatePacket from './PersonalUpdatePacket.js';
import { Stats, StatsContainer } from '../shared/Stats.js'
import { Equipment, EquipmentManager } from '../shared/Equipment.js'

import Formulas from '../shared/Formulas'
import GameObject from './GameObject'
import GameServer from './GameServer'
import Inventory from '../shared/Inventory'
import MovingEntity from './MovingEntity'
import Prism from './Prism'
import Utils from '../shared/Utils'
import World from '../shared/World'

function Player() {
    this.updatePacket = new PersonalUpdatePacket();
    this.isPlayer = true;
    this.battleTeam = 'Player';
    this.entityCategory = 'Player';
    this.updateCategory = 'players';
    this.sentient = true; // used in battle to know if a battle shoud end
    this.schemaModel = GameServer.PlayerModel;
    this.battlePriority = 1;

    this.newAOIs = []; //list of AOIs about which the player hasn't checked for updates yet
    this.oldAOIs = [];
    this.action = null;
    this.inventory = new Inventory(20); //TODO: conf
    this.belt = new Inventory(3); //TODO: conf
    this.sid = 0;
    this.gold = 0;
    this.inBuilding = -1;

    this.classxp = {
        0: 0,
        1: 0,
        2: 0,
        3: 0
    };
    this.classlvl = {
        0: 0,
        1: 0,
        2: 0,
        3: 0
    };
    this.ap = {
        0: 0,
        1: 0,
        2: 0,
        3: 0,
        4: 0 // civic AP
    };
    this.abilities = [];
    this.baseBldrecipes = GameServer.clientParameters.config.defaultBuildRecipes;
    this.bldRecipes = [];

    this.cellsWidth = 1;
    this.cellsHeight = 1;

    this.setUpStats();

    this.equipment = new EquipmentManager();
    this.history = [];
    this.fieldOfVision = [];
    this.visitedAOIs = new Set(); // List of AOIs visitted since last fort debrief
    this.steps = 0;
    MovingEntity.call(this);

    this.extraMarkers = []; // used in tutorial to display mock markers

    this.logSession = Date.now();
}

Player.prototype = Object.create(MovingEntity.prototype);
Player.prototype.constructor = Player;

Player.prototype.setSocketID = function ( socketID) {
    this.socketID = socketID;
};

Player.prototype.setMongoID = function (mongoID) {
    this.mongoID = mongoID;
};

Player.prototype.setInstance = function () {
    this.instance = GameServer.nextInstanceID++;
    this.disableLogging();
    if (GameServer.nextInstanceID % 100 === 0) GameServer.nextInstanceID = 0;
};

Player.prototype.disableLogging = function(){
    this.logSession = 0;
};

Player.prototype.isInstanced = function () {
    return this.instance > -1;
};

Player.prototype.getInstance = function () {
    return GameServer.instances[this.instance];
};

Player.prototype.updateBldRecipes = function () {
    this.bldRecipes = [];
    this.baseBldrecipes.forEach(function (b) {
        // console.warn(b, this.countOwnedBuildings(b));
        if (this.countOwnedBuildings(b) < 1) this.bldRecipes.push(b);
    }, this);
    if (this.bldRecipes.length === 0) this.bldRecipes = [-1];
    this.setOwnProperty('bldRecipes', this.bldRecipes);
};

Player.prototype.countOwnedBuildings = function (type) {
    if (type === -1) return this.buildings.length;
    var count = 0;
    this.buildings.forEach(function (b) {
        if (b.type == type) count++;
    });
    return count;
};

Player.prototype.addBuilding = function(building){
    this.buildings.push(building);
    this.updateBldRecipes();
};

// Called by finalizePlayer
Player.prototype.listBuildingRecipes = function () {
    this.buildings = [];
    for (var bid in GameServer.buildings) {
        var building = GameServer.buildings[bid];
        if (building.owner === this.id) this.buildings.push(building);
    }
    this.updateBldRecipes();
};

Player.prototype.isExplorer = function () {
    return this.class === GameServer.classes.explorer;
};

Player.prototype.isCraftsman = function () {
    return this.class === GameServer.classes.craftsman;
};

Player.prototype.isMerchant = function () {
    return this.class === GameServer.classes.merchant;
};

Player.prototype.setUp = function(id,name,region){
    this.id = id;
    this.name = name;
    this.origin = region;
};

Player.prototype.setRegion = function() {
    var region_ = this.region;
    var newregion = GameServer.getRegion(this);
    if(newregion != region_){
        this.setOwnProperty('region',newregion);
        this.addNotif('Entering '+GameServer.regions[this.region].name+' region');

        if(region_) { // region_ will be null when loading players
            if (region_ in GameServer.regions) GameServer.regions[region_].removePlayer(this.id);
            GameServer.regions[this.region].addPlayer(this.id);

            this.inventory.toList().forEach(function (inv) {
                if (region_ in GameServer.regions) GameServer.regions[region_].removeItem(inv[0], inv[1]);
                GameServer.regions[this.region].addItem(inv[0], inv[1]);
            }, this);
        }
    }
};

Player.prototype.setOrigin = function(origin){
    this.origin = (origin ? origin : GameServer.getRegion(this));
};


/*Player.prototype.setRespawnLocation  = function(x,y){
    this.respawnLocation = {
        x: x,
        y: y
    };
};*/

Player.prototype.getRegionName = function () {
    return GameServer.regions[this.region].name;
};

Player.prototype.updateSteps = function () {
    this.steps++;
    var limit = 1000; // arbitrary limit to avoid overflows
    if (this.steps > limit) this.steps -= limit;
    if (this.steps % GameServer.characterParameters.steps === 0) GameServer.updateVigor(this,'walk');

};

Player.prototype.updateVigor = function (inc, ignoreFood) {
    var vigor = this.getStat('vigor');
    if (!ignoreFood) { // e.g. when regaining vigor through rest
        var food = this.getStat('food');
        inc *= 1 + ((food.getCap() - food.getValue()) / food.getCap());
    }
    var changed = vigor.increment(inc);
    if (changed) {
        this.refreshStat('vigor');
        this.applyVigorModifier();
    }
};

Player.prototype.updateFood = function (inc) {
    var changed = this.getStat('food').increment(inc);
    if (changed) this.refreshStat('food');
};

Player.prototype.applyVigorModifier = function () {
    var vigor = this.getStat('vigor');
    var delta = vigor.getCap() - vigor.getValue();
    var malus = Utils.clamp(delta - 30, 0, vigor.getCap());
    if (malus === 0) return;
    this.getStats().forEach(function (stat) {
        if (Stats[stat].noModifier) return;
        var statObj = this.getStat(stat);
        statObj.clearRelativeModifiers();
        statObj.addRelativeModifier(-malus);
        this.refreshStat(stat);
    }, this);
};

Player.prototype.setStartingInventory = function () {
    // TODO: move to some config file
    var list = [
        [3, 5],
        [2,1],
        [19,1],
        [20,3],
        [51,1],
        [6,1]
    ];
    list.forEach(function (l) {
        this.giveItem(l[0], l[1]);
        GameServer.createItem(l[0], l[1], this.origin, 'start');
    }, this);

    this.giveGold(300);
    this.save();
};

Player.prototype.setUpStats = function () {
    // Initializes all existing stats with default values
    this.stats = new StatsContainer();
    // Applies starting values from config file
    var starts = GameServer.characterParameters.variables;
    for(var v in starts){
        this.setStat(v, starts[v]);
    }
    /*var list = ['hpmax', 'dmg', 'def'];
    list.forEach(function (s) {
        this.setStat(s, v[s]);
    }, this);*/
    this.maxStat('hp');
};

Player.prototype.maxStat = function (key) {
    var s = this.getStat(key);
    s.setBaseValue(s.maxStat.getValue());
    this.refreshStat(key);
};

Player.prototype.setStat = function (key, value) {
    this.getStat(key).setBaseValue(value);
    this.refreshStat(key);
};

Player.prototype.refreshStat = function (key) {
    this.updatePacket.addStat(this.getStat(key).trim());
};

Player.prototype.applyDamage = function (dmg) {
    MovingEntity.prototype.applyDamage.call(this, dmg);
    this.refreshStat('hp');
};

Player.prototype.die = function () {
    MovingEntity.prototype.die.call(this);
    // this.updatePacket.dead = true;
    this.setOwnProperty('dead', true);
};

Player.prototype.setLocation = function(x, y){
    x = x || GameServer.regions[this.origin].x;
    y = y || GameServer.regions[this.origin].y;
    var pos = GameServer.findNextFreeCell(x,y);
    x = pos.x;
    y = pos.y;
    this.setProperty('x', x);
    this.setProperty('y', y);
    this.setOwnProperty('x', x);
    this.setOwnProperty('y', y);
    this.setOrUpdateAOI(); // takes care of adding to the world as well
};

/**
 * Make the player appears at his allocated (re)spawn location and check for battle when
 * doing so.
 */
Player.prototype.spawn = function (checkLocation) {
    if(checkLocation) this.setLocation();
    var battleCell = GameServer.checkForBattle(this.x, this.y);
    if (battleCell) GameServer.expandBattle(battleCell.battle, this);
};

Player.prototype.respawn = function () {
    this.setProperty('dead', false);
    this.setOwnProperty('dead', false);
    this.setStat('hp', this.getStatValue('respawnhp'));
    this.spawn(true);
    this.setOrUpdateAOI();
    this.save();
    // TODO: loose loot?
};

Player.prototype.gainClassXP = function (classID, inc, notify) {
    if (notify) this.addNotif('+' + inc + ' ' + GameServer.classData[classID].name + ' XP');
    var max = Formulas.computeMaxClassXP(this.classlvl[classID]);
    this.classxp[classID] = Utils.clamp(this.classxp[classID] + inc, 0, GameServer.characterParameters.maxClassXP);
    if (this.classxp[classID] >= max) {
        if (this.classlvl[classID] === GameServer.characterParameters.maxClassLvl) {
            this.classxp[classID] = max;
        } else {
            this.classxp[classID] -= max;
            this.classLvlUp(classID, notify);
        }
    }
    this.setOwnProperty('classxp', this.classxp);
};

Player.prototype.classLvlUp = function (classID, notify) {
    this.classlvl[classID]++;
    var nb = 3; // TODO: vary number
    this.ap[classID] += nb;
    this.setOwnProperty('classlvl', this.classlvl);
    this.setOwnProperty('ap', this.ap);
    if (notify) {
        this.addNotif('Reached ' + GameServer.classData[classID].name + ' level ' + this.classlvl[classID] + '!');
        this.addNotif('Earned ' + nb + ' AP!');
    }
    this.save();
};

Player.prototype.acquireAbility = function(aid){
    var ability = GameServer.abilitiesData[aid];
    this.abilities.push(parseInt(aid));
    this.ap[ability.class] = Utils.clamp(this.ap[ability.class]-ability.cost,0,999);
    this.setOwnProperty('ap', this.ap);
    this.setOwnProperty('abilities',this.abilities);
    this.applyAbility(aid);
    this.addNotif('You acquired a new ability: '+ability.name+'!');
};

Player.prototype.applyAbilities = function(){
    this.abilities.forEach(this.applyAbility,this);
};

Player.prototype.applyAbility = function(aid){
    var data = GameServer.abilitiesData[aid];
    if(!data['effect']) return;
    var effect = data['effect'].split(':');
    this.applyAbsoluteModifier(effect[0],parseInt(effect[1]));
};

Player.prototype.hasAbility = function(aid){
    return this.abilities.includes(aid);
};

Player.prototype.giveGold = function (nb, notify) {
    // this.gold = Utils.clamp(this.gold+nb,0,GameServer.characterParameters.maxGold);
    // this.updatePacket.updateGold(this.gold);
    this.setOwnProperty('gold', Utils.clamp(this.gold + nb, 0, GameServer.characterParameters.maxGold));
    if (notify) {
        this.addNotif('Received ' + nb + ' ' + Utils.formatMoney(nb));
        this.save();
    }
};

Player.prototype.takeGold = function (nb, notify) {
    // this.gold = Utils.clamp(this.gold-nb,0,GameServer.characterParameters.maxGold);
    // this.updatePacket.updateGold(this.gold);
    this.setOwnProperty('gold', Utils.clamp(this.gold - nb, 0, GameServer.characterParameters.maxGold));
    if (notify) {
        this.addNotif('Gave ' + nb + ' ' + Utils.formatMoney(nb));
        this.save();
    }
    return nb;
};

Player.prototype.canBuy = function (price) { // check if building has gold and room
    if (this.inventory.isFull()) {
        console.log('Error: player inventory full');
        return false;
    }
    if (price > this.gold) {
        console.log('Error: not enough gold for player');
        return false;
    }
    return true;
};

Player.prototype.canCraft = function (item, nb) {
    var itemData = GameServer.itemsData[item];
    if(itemData.ability && !this.hasAbility(itemData.ability)) return false;
    var recipe = itemData.recipe;
    for (var itm in recipe) {
        if (!this.hasItem(itm, recipe[itm] * nb)) return false;
    }
    return true;
};

Player.prototype.getGold = function () {
    return this.gold;
};

Player.prototype.getItemNb = function (item) {
    return this.inventory.getNb(item);
};

Player.prototype.getItemNbInBelt = function (item) {
    return this.belt.getNb(item);
};

Player.prototype.hasItem = function (item, nb) {
    return (this.inventory.getNb(item) >= nb);
};

Player.prototype.hasItemInBelt = function (item) {
    return (this.belt.getNb(item) > 0);
};

/**
 * Give an item to the player (always to backpack)
 * @param {number} item - ID of the item to give.
 * @param {number} nb - Amout to give.
 * @param {boolean} notify - Send a notification to the player or not.
 * @param {string} verb - Which verb to use in the notification (pick, buy, ...) 
 */
Player.prototype.giveItem = function (item, nb, notify, verb) {
    this.inventory.add(item, nb);
    this.updatePacket.addItem(item, this.inventory.getNb(item));
    if (notify) {
        // this.addNotif('+'+nb+' '+GameServer.itemsData[item].name);
        verb = verb || 'Received';
        this.addNotif(verb + ' ' + nb + ' ' + GameServer.itemsData[item].name);
        this.save();
    }
    return this;
};

/**
 * Take an item from the inventory (backpack or the belt)
 * @param {number} item - ID of the item to take.
 * @param {number} nb - Amout to take.
 * @param {string} inventory - Which inventory to take from (belt or backpack)
 * @param {boolean} notify - Send a notification to the player or not.
 * @param {string} verb - Which verb to use in the notification (drink, use, ...) 
 */
Player.prototype.takeItem = function (item, nb, inventory, notify, verb) {
    // console.log('taking item',item,nb,inventory,notify,verb);
    if(inventory == 'belt'){
        this.takeFromBelt(item,nb);
    }else{
        this.takeFromBackpack(item,nb);
    }
    if (notify) {
        verb = verb || 'Sold';
        this.addNotif(verb + ' ' + nb + ' ' + GameServer.itemsData[item].name);
        this.save();
    }
};

Player.prototype.takeFromBackpack = function(item,nb){
    this.inventory.take(item, nb);
    this.updatePacket.addItem(item, this.inventory.getNb(item));
};

Player.prototype.addToBelt = function (item, nb) {
    this.belt.add(item, nb);
    this.updatePacket.addBelt(item, this.belt.getNb(item));
};

Player.prototype.takeFromBelt = function (item, nb) {
    this.belt.take(item, nb);
    this.updatePacket.addBelt(item, this.belt.getNb(item));
};

Player.prototype.backpackToBelt = function(item){
    var nb = this.getItemNb(item);
    this.takeItem(item,nb);
    this.addToBelt(item,nb);
};

Player.prototype.beltToBackpack = function(item){
    var nb = this.getItemNbInBelt(item);
    this.takeFromBelt(item,nb);
    this.giveItem(item,nb);
};

/**
 * Check if a non-permanent item is equipped in the slot 
 * (i.e. something else than hands/fists).
 * @param {string} slot - name of the slot where the item of
 * interest is equiped.
 * @returns {boolean} is a non-permanent item equipped or not.
 */
Player.prototype.isEquipped = function (slot) {
    var item = this.getEquippedItem(slot);
    if(!item) return false;
    return !item.permanent;
};

Player.prototype.getContainerType = function(){
    return this.equipment.getEquippedContainerType();
};

Player.prototype.canEquip = function (slot, item) {
    if (!(slot in Equipment.slots)) {
        console.log('invalid slot');
        return false;
    }
    var itemData = GameServer.itemsData[item];
    if(itemData.equipment != slot){
        console.log('Wrong slot');
        return false;
    }
    if(slot == 'range_ammo'){
        if(itemData.container_type != this.getContainerType()){
            console.log('Container mismatch');
            return false;
        }
    }
    return true;
};

/**
 * Equip a piece of equipment. Doesn't check for item ownership,
 * this should be done upsteam (e.g. in `GameServer.handleUse()`.)
 * @param {string} slot - Name of the slot in which to equip.
 * @param {number} itemID - ID of the item to equip.
 * @param {boolean} fromDB - Does the order come from DB (if not, then
 * it comes from player use).
 * @returns {number} - number of items to remove from inventory (0 if failure)
 */
Player.prototype.equip = function (slot, itemID, fromDB, inventory) {

    if (typeof itemID != 'number') {
        console.warn('ERROR in `Player.equip()`: item is not a number');
        console.warn(typeof itemID);
        return 0;
    }
    if (!itemID) return 0;
    if(!this.canEquip(slot, itemID)) {
        console.log('Item cannot be equipped in that slot');
        return 0;
    }

    // If reloading ammo, it's ok if some is still equipped
    if(slot != 'range_ammo') {
        if (this.getEquippedItemID(slot) == itemID){
            console.log('Item already equipped');
            return 0;
        }
    }
    // Unequip currently equipped
    if(this.getEquippedItemID(slot) != itemID) this.unequip(slot);

    var slotData = Equipment.getData(slot);
    if (slotData) {
        var conflictSlot = slotData.conflict; // Name of the slot with which the new object could conflict
        if (conflictSlot && this.isEquipped(conflictSlot)) this.unequip(conflictSlot, true);
    }

    this.equipment.set(slot, itemID);
    this.updatePacket.addEquip(slot, itemID);
    this.applyAbsoluteModifiers(itemID);

    var nb = 1;

    // Manage ammo
    // If fromDB, `Player.getDataFromDB()` will take care to load as much
    // amo as was equipped by the player. Therefore the below code should
    // not be run.
    if (slot === 'range_ammo' && !fromDB) {
        // var range_container_id = this.equipment.get('range_container');
        nb = this.computeLoad(itemID, inventory); // compute how much will be added to the container
        this.load(nb);
    }

    return nb;
};

/**
 *
 * @param slot {string} - Key in Equipment.
 * @param notify {boolean} - Send a notification to player or not.
 */
Player.prototype.unequip = function (slot, notify) {
    var item_id = this.equipment.get(slot);
    if (!item_id || item_id === -1) return;

    let item_data = GameServer.itemsData[item_id];

    if (!item_data || item_data.permanent) return;

    var nb = 1;
    if (slot === 'range_ammo') nb = this.unload('range_ammo');

    this.giveItem(item_id, nb);

    this.equipment.set(slot, -1);
    this.updatePacket.addEquip(slot, -1);
    this.applyAbsoluteModifiers(item_id, -1);

    if (slot === 'range_container') this.unequip('range_ammo', true);

    // Replace with permanent equipment
    if (slot in Equipment.slots) {
        var defaultItem = Equipment.slots[slot].defaultItem;
        this.equip(slot, defaultItem, true);
    }

    if (notify) {
        this.addNotif('Unequipped ' + nb + ' ' + GameServer.itemsData[item_id].name + (nb > 1 ? 's' : ''));
        this.save();
    }
};

Player.prototype.applyAbsoluteModifiers = function (itemID, change) {

    var change = change || 1;
    var itemData = GameServer.itemsData[itemID];

    if (!itemData) return;
    if (!itemData.effects) return;

    for (var stat in itemData.effects) {
        if (!itemData.effects.hasOwnProperty(stat)) continue;
        if (change === 1) {
            this.applyAbsoluteModifier(stat, itemData.effects[stat]);
        } else if (change === -1) {
            this.removeAbsoluteModifier(stat, itemData.effects[stat]);
        }
    }
};

Player.prototype.applyAbsoluteModifier = function (stat, modifier) {
    this.getStat(stat).addAbsoluteModifier(modifier);
    this.refreshStat(stat);
};

Player.prototype.removeAbsoluteModifier = function (stat, modifier) {
    this.getStat(stat).removeAbsoluteModifier(modifier);
    this.refreshStat(stat);
};

/**
 * Compute how much ammo can be loaded in the ammo container.
 * @param {number} item - item ID of ammo to load.
 * @returns {number} amount of ammo to load.
 */
Player.prototype.computeLoad = function (item, inventory) {

    let capacity = 0;
    let currentNb = this.equipment.getNbAmmo();
    let range_container_id = this.equipment.get('range_container');
    const range_container_item = GameServer.itemsData[range_container_id];

    // console.log('computeLoad', range_container_id);
    // console.log(GameServer.itemsData[range_container_id]);

    if (range_container_item) capacity = range_container_item.capacity;
    if (currentNb && currentNb > 0) capacity = capacity - currentNb;

    const ammo_count_in_inventory = (inventory == 'backpack' ? this.inventory.getNb(item) : this.belt.getNb(item) );

    return Math.min(ammo_count_in_inventory, capacity);
};

/**
 * Increase the amount of ammo un the `range_ammo` slot by `nb`.
 * Doesn't check anything about capacity, has to be checked upstream.
 * @param {number} nb - Amount of ammo to add.
 */
Player.prototype.load = function (nb){
    if (typeof nb != 'number') {
        console.warn('ERROR in `Player.load()`: nb is not a number');
        console.warn('Nb : ', nb, typeof nb);
        return false;
    }
    this.equipment.load(nb);
    this.updatePacket.addAmmo(this.equipment.getNbAmmo());
    return true;
};

Player.prototype.unload = function (notify) {
    var nb = this.equipment.getNbAmmo();
    var item = this.equipment.get('range_ammo');
    this.equipment.setAmmo(0);
    this.updatePacket.addAmmo('range_ammo', 0);
    if (notify) this.addNotif('Unloaded ' + GameServer.itemsData[item].name);
    return nb;
};


Player.prototype.getNbAmmo = function () {
    return this.equipment.getNbAmmo();
};


Player.prototype.applyEffects = function (item, notify) {
    var itemData = GameServer.itemsData[item];
    if (!itemData.effects) return 0;
    for (var stat in itemData.effects) {
        if (!itemData.effects.hasOwnProperty(stat)) continue;
        this.applyEffect(stat, itemData.effects[stat], notify);
    }
    return 1;
};

// Apply effect of consumable object
Player.prototype.applyEffect = function (stat, delta, notify) {
    this.getStat(stat).increment(delta);
    this.refreshStat(stat);
    if (notify) {
        var change = delta;
        if (change >= 0) change = '+' + change;
        this.addNotif(Stats[stat].name + ' ' + change);
    }
};

Player.prototype.getIndividualUpdatePackage = function () {
    var pkg = this.updatePacket;
    if (GameServer.checkFlag('FoW')) pkg.fow = GameServer.fowList;
    if (GameServer.checkFlag('frontier')) pkg.frontier = GameServer.frontier;
    if (GameServer.checkFlag('regionsStatus')) pkg.regionsStatus = GameServer.getRegionsStatus();
    if (GameServer.checkFlag('animalsMarkers')) pkg.animalMarkers = GameServer.listAnimalMarkers();
    if (GameServer.checkFlag('resourcesMarkers')) pkg.resourceMarkers = GameServer.listResourceMarkers();
    if (GameServer.checkFlag('buildingsMarkers')) pkg.buildingMarkers = GameServer.listBuildingMarkers(this.instance);
    if (GameServer.checkFlag('deathMarkers')) pkg.deathMarkers = GameServer.listMarkers('death');
    if (GameServer.checkFlag('conflictMarkers')) pkg.conflictMarkers = GameServer.listMarkers('conflict');
    if (pkg.isEmpty()) return null;
    this.updatePacket = new PersonalUpdatePacket();
    return pkg;
};

Player.prototype.getWorldInformation = function(){
    this.setOwnProperty('fow',GameServer.fowList);
    this.setOwnProperty('frontier',GameServer.frontier);
    this.setOwnProperty('regionsBoundaries',GameServer.regionBoundaries);
    this.setOwnProperty('regionsStatus',GameServer.getRegionsStatus());
    this.setOwnProperty('buildingMarkers', GameServer.listBuildingMarkers(this.instance));
    this.setOwnProperty('resourceMarkers',  GameServer.listResourceMarkers());
    this.setOwnProperty('animalMarkers', GameServer.listAnimalMarkers());
    this.setOwnProperty('deathMarkers', GameServer.listMarkers('death'));
    this.setOwnProperty('conflictMarkers', GameServer.listMarkers('conflict'));
    // this.setOwnProperty('rarity', GameServer.getRarity());
    this.setOwnProperty('history',this.history);
};

/**
 * Create a smaller object containing the properties needed to initialize
 * the player character on the client-side. Called in `gs.createInitializationPacket()`
 * @returns {{}}
 */
Player.prototype.initTrim = function () {
    var trimmed = {};
    var broadcastProperties = ['id', 'name','classxp','classlvl','ap','abilities']; // list of properties relevant for the client
    for (var p = 0; p < broadcastProperties.length; p++) {
        trimmed[broadcastProperties[p]] = this[broadcastProperties[p]];
    }
    trimmed.region = GameServer.getRegion(this);
    trimmed.x = parseInt(this.x);
    trimmed.y = parseInt(this.y);
    return trimmed;
};

/**
 * Create a smaller object containing the properties needed for the *other clients*
 * (Properties needed by the player itself are put into his individualUpdatePacjage)
 * @returns {{}}
 */
Player.prototype.trim = function () {
    var trimmed = {};
    var broadcastProperties = ['id', 'path', 'inFight', 'inBuilding', 'chat',
        'battlezone', 'dead']; // list of properties relevant for the client
    broadcastProperties.forEach(function (field) {
        trimmed[field] = this[field];
    }, this);
    trimmed.region = this.sid;
    trimmed.x = parseInt(this.x);
    trimmed.y = parseInt(this.y);
    // trimmed.quickSlots = this.equipment.quickslots.nb;
    // return trimmed;
    return GameObject.prototype.trim.call(this, trimmed);
};

/**
 * Update a property and simultaneously add it to the list of changes
 * to be sent to the client.
 * @param {string} property - Name of the field to modify.
 * @param value - Value to assign.
 */
Player.prototype.setOwnProperty = function (property, value) {
    this[property] = value;
    this.updatePacket[property] = value;
};

Player.prototype.getDataFromDb = function (data) {
    this.id = data.id;
    this.name = data.name;
    this.x = Utils.clamp(data.x, 0, World.worldWidth - 1);
    this.y = Utils.clamp(data.y, 0, World.worldHeight - 1);
    this.classxp = data.classxp;
    this.classlvl = data.classlvl;
    this.abilities = data.abilities;
    this.setOwnProperty('inBuilding', data.inBuilding);

    this.setUpStats();
    if (!data.stats) data.stats = [];
    data.stats.forEach(function (stat) {
        var s = this.getStat(stat.stat);
        if(s) {
            s.setBaseValue(stat.value);
            this.refreshStat(stat.stat);
        }
    }, this);
    this.setStat('hp', Math.max(this.getStat('hp').getValue(), 10)); // quick fix TODO remove
    this.applyAbilities();
    this.applyVigorModifier();

    if (data) {
        if (data.equipment) {
            for (var slot in data.equipment.slots) {
                var info = GameServer.parseEquipmentDb(data.equipment.slots[slot]);
                var item = info[0];
                var nb = info[1];
                // var item = data.equipment.slots[slot];
                // // console.warn('ITEM:',item);
                // // fix corrupt item data due to development
                // if (typeof item.id == 'object') {
                //     if (item.id.hasOwnProperty('id')) { // fix nested objects
                //         item.id = item.id.id;
                //     } else {
                //         item.id = -1;
                //     }
                // }
                // item.id = parseInt(item.id);
                // item.nb = parseInt(item.nb);
                if (typeof nb != 'number') nb = 0;
                if (item === -1) continue;
                this.equip(slot, item, true);
                if (slot == 'range_ammo' && nb) this.load(nb);
            }
        }

        if (data.inventory) {
            data.inventory.forEach(function (i) {
                this.giveItem(i[0], i[1]);
            }, this);
        }

        if (data.belt) {
            data.belt.forEach(function (i) {
                this.addToBelt(i[0], i[1]);
            }, this);
        }
    }

    this.setOrigin(data.origin);
    this.giveGold(data.gold);
    this.history = data.history;

    var delta = (Date.now() - data.savestamp);
    var deltaturns = Math.floor(delta / (GameServer.turnDuration * 1000));
    this.fastForward(deltaturns);
};

Player.prototype.save = function () {
    if (this.inFight) return false;
    this.savestamp = Date.now();
    GameObject.prototype.save.call(this);
};

Player.prototype.setAction = function (action) {
    this.action = action;
};

Player.prototype.onAOItransition = function (newAOI, previousAOI) {
    if (!this.visitedAOIs.has(newAOI)) {
        this.visitedAOIs.add(newAOI);
        if (previousAOI) { // if previousAOI: don't grant XP for spawning in fort
            Prism.logEvent(this, 'explore', {aoi: newAOI});
            this.save();
        }
    }
};

Player.prototype.onEndOfPath = function () {
    MovingEntity.prototype.onEndOfPath.call(this);
    if (this.inFight) return;
    if (!this.action) return;
    if (this.action.type === 1) this.enterBuilding(this.action.id);
    if (this.action.type === 2) GameServer.lootNPC(this, 'animal', this.action.id);
    if (this.action.type === 3) GameServer.pickUpItem(this, this.action.id);
    if (this.action.type === 4) GameServer.lootNPC(this, 'civ', this.action.id);
};


Player.prototype.enterBuilding = function (id) {
    // TODO: check for proximity
    // TODO: add to a list of people in the building object
    this.setProperty('inBuilding', id);
    var building = GameServer.buildings[id];
    var type = building.type;
    var bldname = GameServer.buildingsData[type].name;
    var phrase = ['Entered', (building.isOwnedBy(this) ? 'my' : building.ownerName + '\'s'), bldname];
    this.addNotif(phrase.join(' ')); //true = silent
    if (!building.isOwnedBy(this)) {
        var phrase = [this.name, 'visitted my', bldname];
        GameServer.notifyPlayer(building.owner, phrase.join(' '));
    }
    Prism.logEvent(this, 'building', {building: type, owner: building.ownerName});
    return true;
};

Player.prototype.exitBuilding = function () {
    if (!this.isInBuilding()) return;
    /*var building = GameServer.buildings[this.inBuilding];
    var type = building.type;
    var bldname = GameServer.buildingsData[type].name;
    var phrase = ['Left',(building.isOwnedBy(this) ? 'my' : building.ownerName+'\'s'),bldname];
    this.addNotif(phrase.join(' ')); // true = silent*/
    this.setProperty('inBuilding', -1);
    this.setOwnProperty('inBuilding', -1);
};

Player.prototype.endFight = function (alive) {
    MovingEntity.prototype.endFight.call(this);
    if (this.xpPool && alive) this.gainClassXP(0, this.xpPool, true);
};

Player.prototype.isAvailableForFight = function () {
    return (!this.isInBuilding() && !this.isDead() && !this.inFight);
};

Player.prototype.isInBuilding = function () {
    // console.warn('inBuilding:',this.inBuilding);
    return this.inBuilding !== -1;
};

Player.prototype.isInside = function (buildingID) {
    return this.inBuilding === buildingID;
};

Player.prototype.notifyFight = function (flag) {
    this.setOwnProperty('fightStatus', flag);
};

Player.prototype.addMsg = function (msg) {
    this.updatePacket.addMsg(msg);
};

Player.prototype.addNotif = function (msg, silent) {
    if (!silent) this.updatePacket.addNotif(msg);
    this.history.push([Date.now(), msg]);
    var MAX_LENGTH = 20; // TODO: max limit in conf
    if (this.history.length > MAX_LENGTH) this.history.splice(0, this.history.length - MAX_LENGTH);
};

Player.prototype.fastForward = function (nbturns) {
    console.log('Fast forward', nbturns, 'turns');
    var foodRate = GameServer.economyTurns['foodConsumptionRate'];
    var restRate = GameServer.economyTurns['restRate'];
    var nbStarvationTurns = Math.floor(nbturns / foodRate);
    var nbRestTurns = Math.floor(nbturns / restRate);
    this.starve(nbStarvationTurns);
    this.rest(nbRestTurns);
    this.save();
};

Player.prototype.update = function () {
    if (GameServer.isTimeToUpdate('foodConsumptionRate')) this.starve(1);
    if (GameServer.isTimeToUpdate('restRate') && this.inBuilding > -1) this.rest(1);
};

Player.prototype.starve = function (nb) {
    console.log('Starving for', nb, 'cycles');
    this.updateFood(-(nb * GameServer.characterParameters.foodConsumption));
};

Player.prototype.rest = function (nb) {
    var building = GameServer.buildings[this.inBuilding];
    if (!building) {
        console.log('Not in a building');
        return;
    }
    if (!building.isBuilt()){
        console.log('Not built');
        return;
    }
    var buildingData = GameServer.buildingsData[building.type];
    if (!buildingData.shelter) {
        console.log('Building doesn\'t offer shelter');
        return;
    }
    if (!building.isOwnedBy(this)){
        console.log('Not the owner');
        return;
    }
    console.log('Resting for', nb, 'cycles');
    this.updateVigor(nb * buildingData.restVigorAmount, true); // true = ignore food level
    var changed = this.getStat('hp').increment(nb * buildingData.restHealthAmount);
    if (changed) this.refreshStat('hp');
};

Player.prototype.remove = function () {
    if (this.battle) this.battle.removeFighter(this);
    GameServer.regions[this.region].removePlayer(this.id);
    delete GameServer.players[this.id];
    GameServer.updateVision();
};

export default Player