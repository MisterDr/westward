/**
 * Created by Jerome Renaux (jerome.renaux@gmail.com) on 23-04-18.
 */

import BattleManager from './BattleManager'
import Client from './Client'
import Engine from './Engine'
import {EquipmentManager, Equipment} from '../shared/Equipment'
import Inventory from '../shared/Inventory'
import Player from './Player'
import {StatsContainer} from '../shared/Stats'
import TutorialManager from './TutorialManager'
import UI from './UI'
import Utils from '../shared/Utils'
import World from '../shared/World'

import itemsData from '../assets/data/items.json' assert { type: 'json' }
import regionsData from '../assets/data/regions.json' assert { type: 'json' }

let Hero = new Phaser.Class({
    Extends: Player,

    initialize: function Hero(){
        Player.call(this);
        this.isHero = true;

        this.buildRecipes = new Inventory(7);
        this.craftRecipes = new Inventory(100);

    },

    setUp: function(data){
        // data comes from Player.initTrim() server-side
        Player.prototype.setUp.call(this,data);

        this.region = data.region || 0;
        this.buildingMarkers = [];
        this.resourceMarkers = [];
        this.animalMarkers = [];
        this.deathMarkers = [];
        this.conflictMarkers = [];
        this.FoW = [];
        this.frontier = [];
        this.regions = [];
        this.inventory = new Inventory(20);
        this.belt = new Inventory(3); //TODO: conf
        this.stats = new StatsContainer();
        this.equipment = new EquipmentManager();
        this.history = [];

        this.gold =  0;
        this.classxp = data.classxp;
        this.classlvl = data.classlvl;
        this.ap = data.ap;
        this.abilities = data.abilities || [];
        this.name = data.name;

        // this.updateRarity([]);

        this.buildRecipes.fromList(Engine.config.defaultBuildRecipes);

        for(let item_id in itemsData){
            let item = itemsData[item_id];
            if(item.basicRecipe) this.craftRecipes.add(item_id,1);
        }
    },

    updateData: function(data){ // don't call this 'update' or else conflict with Player.update() for other player updates
        let callbacks = {
            'abilities': this.updateAbilities,
            'animalMarkers': this.updateAnimalMarkers,
            'ammo': this.updateAmmo,
            'ap': this.updateAP,
            'belt': this.updateBelt,
            'bldRecipes': this.updateBuildRecipes,
            'buildingMarkers': this.updateBuildingMarkers,
            'civiclvl': this.updateCivicLvl,
            'classlvl': this.updateClassLvl,
            'classxp': this.updateClassXP,
            'conflictMarkers': this.updateConflictMarkers,
            'dead': this.handleDeath,
            'deathMarkers': this.updateDeathMarkers,
            'equipment': this.updateEquipment,
            'fow': this.updateFoW,
            'frontier': this.updateFrontier,
            'gold': this.updateGold,
            'history': this.updateHistory,
            'inBuilding': this.updateBuilding,
            'items': this.updateInventory,
            'msgs': this.handleMsgs,
            'notifs': this.handleNotifs,
            // 'rarity': this.updateRarity,
            'region': this.updateRegion,
            'regionsBoundaries': this.updateRegions,
            'regionsStatus': this.updateRegionsStatus,
            'resetTurn': BattleManager.resetTurn,
            'resourceMarkers': this.updateResourceMarkers,
            'stats': this.updateStats
        };

        this.updateEvents = new Set();

        for(let field in callbacks){
            if(!callbacks.hasOwnProperty(field)) continue;
            if(field in data) callbacks[field].call(this,data[field]);
        }

        this.updateEvents.forEach(function (e) {
            Engine.updateMenus(e);
        }, this);
        if(this.updateEvents.has('map') && Engine.miniMap && Engine.miniMap.displayed) Engine.miniMap.map.updatePins();

        let battleCallbacks = {
            'battleData': BattleManager.updateBattle
        };

        if('fightStatus' in data) BattleManager.handleFightStatus(data['fightStatus']); // Do first before any other battle update
        for(let field in battleCallbacks){
            if(!battleCallbacks.hasOwnProperty(field)) continue;
            if(field in data) battleCallbacks[field].call(this,data[field]);
        }

        if(data.x >= 0 && data.y >= 0) this.teleport(data.x,data.y);

        Engine.updateAllOrientationPins();

        Engine.firstSelfUpdate = false;
    },

    needsToCraft: function(item){
        let required = 0;
        let owned = 0;
        let recipe = itemsData[item].recipe;
        for(let itm in recipe){
            required++;
            if(this.hasItem(itm,recipe[itm])) owned++;
        }
        return [owned,required];
    },

    canCraft: function(item, nb){
        if(itemsData[item].ability && !this.hasAbility(itemsData[item].ability)) return false;
        let recipe = itemsData[item].recipe;
        for(let itm in recipe){
            if(!this.hasItem(itm,recipe[itm]*nb)) return false;
        }
        return true;
    },


// ### GETTERS ###

    getEquippedItemID: function(slot){
        return this.equipment.get(slot); // Returns the ID of the item equipped at the given slot
    },

    getEquippedItem: function(slot){
        return this.equipment.getItem(slot);
    },

    hasRangedEquipped: function(){
        // console.warn(this.getEquippedItemID(),Equipment.slots['rangedw'].defaultItem);
        return (this.getEquippedItemID('rangedw') > -1) && (this.getEquippedItemID('rangedw') != Equipment.slots['rangedw'].defaultItem);
    },

    getMaxAmmo: function(){
        let container_id = this.equipment.get('range_container');
        return itemsData[container_id].capacity;
    },

    getNbAmmo: function(){
        return this.equipment.getNbAmmo();
    },

    getNbAnyAmmo: function(){
        return this.getNbAmmo();
    },

    getRangedCursor: function(){
        let rangedw = this.getEquippedItemID('rangedw');
        if(rangedw === -1) return 'bow';
        return (itemsData[rangedw].container_type === 'bullets' ? 'gun' : 'bow');
    },

    getStat: function(stat){
        return this.stats[stat];
    },

    getStatValue: function(stat){
        return this.getStat(stat).getValue();
    },

    hasItem: function(item,nb){
        return (this.inventory.getNb(item) >= nb);
    },

    hasAbility: function(aid){
        return this.abilities.includes(aid);
    },

    getItemNb: function (item) {
        return this.inventory.getNb(item);
    },

    isAmmoEquipped: function(slot){
        return this.equipment.hasAnyAmmo(slot);
    },

    // ### UPDATES #####

    handleDeath: function(dead){
        if(dead === true) Engine.manageDeath();
        if(dead === false) Engine.manageRespawn();
    },

    handleMsgs: function(msgs){
        for(let i = 0; i < msgs.length; i++){
            this.talk(msgs[i]);
        }
    },

    handleNotifs: function(notifs){
        UI.handleNotifications(notifs);
        notifs.forEach(function(notif){
            this.history.unshift([Date.now(),notif]);
        },this);
        this.updateEvents.add('history');
    },

    handleOver: function(){
        Moving.prototype.handleOver.call(this);
    },

    handleOut: function(){
        Moving.prototype.handleOut.call(this);
    },

    updateAmmo: function(ammo){
        for(let i = 0; i < ammo.length; i++){
            let am = ammo[i];
            this.equipment.setAmmo(am.nb);
        }
        this.updateEvents.add('equip');
    },

    updateAP: function(ap){
        this.ap = ap;
        this.updateEvents.add('character');
        //TODO: add sound effect
    },

    updateBelt: function(items){
        this.belt.updateItems(items);
        this.updateEvents.add('belt');
        // if(Client.tutorial) TutorialManager.checkHook();

        if(!Engine.firstSelfUpdate) {
            items.forEach(function (item) {
                let sound = itemsData[item[0]].sound;
                if(sound) Engine.scene.sound.add(sound).play();
            });
        }
    },

    updateBuildRecipes: function(bldRecipes){
        this.buildRecipes.clear();
        if(bldRecipes.length === 1 && bldRecipes[0] === -1) return;
        bldRecipes.forEach(function(w){
            this.buildRecipes.add(w,1);
        },this);
        this.updateEvents.add('bldrecipes');
    },

    postChunkUpdate: function(){
        if(this.chunk !== this.previousChunk) Engine.updateEnvironment();
        this.previousChunk = this.chunk;
    },

    updateCivicLvl: function(civiclvl){
        this.civiclvl = civiclvl;
        this.updateEvents.add('citizen');
        // TODO: add sound effect
    },

    updateClassLvl: function(classlvl){
        this.classlvl = classlvl;
        this.updateEvents.add('character');
        // TODO: add sound effect
    },

    updateClassXP: function(classxp){
        this.classxp = classxp;
        this.updateEvents.add('character');
        // TODO: add sound effect
    },

    updateEquipment: function(equipment){
        for(let i = 0; i < equipment.length; i++){
            let eq = equipment[i];
            this.equipment.set(eq.slot,eq.item);
        }
        this.updateEvents.add('equip');
    },

    updateFood: function(food){
        this.food = food;
        this.updateEvents.add('food');
    },

    updateFoW: function(aois){
        this.FoW = [];
        if(!aois) aois = [Engine.player.chunk];
        aois.forEach(function(aoi){
            let origin = Utils.AOItoTile(aoi);
            this.FoW.push(
                new Phaser.Geom.Rectangle(
                    origin.x,
                    origin.y,
                    World.chunkWidth,
                    World.chunkHeight)
            );
        },this);
    },

    updateFrontier: function(frontier){
        this.frontier = frontier;
    },

    updateRegion: function(region){
        this.region = region;
        Engine.setlCapsule.setText(regionsData[region].name);
    },

    updateRegions: function(regions){ // update region boundaries
        this.regions = regions;
    },

    updateRegionsStatus: function(regions){
        this.regionsStatus = regions;
    },

    updateGold: function(gold){
        this.gold = gold;
        this.updateEvents.add('gold');
        // TODO: move sound effect
    },

    updateBuilding: function(buildingID){
        this.inBuilding = buildingID;
    },

    updateHistory: function(history){
        this.history = history || [];
        for(let i = 0; i < this.history.length; i++){
            this.history[i][0] -= Client.serverTimeDelta;
        }
        this.history.reverse();
    },

    updateInventory: function(items){
        this.inventory.updateItems(items);
        this.updateEvents.add('inv');
        if(Client.tutorial) TutorialManager.checkHook();

        if(!Engine.firstSelfUpdate) {
            items.forEach(function (item) {
                let sound = itemsData[item[0]].sound;
                if(sound) Engine.scene.sound.add(sound).play();
            });
        }
    },

    updateAbilities: function(abilities){
        this.abilities = abilities;
    },

    updateAnimalMarkers: function(markers){
        this.animalMarkers = markers;
        this.updateEvents.add('map');
        // if(Engine.miniMap.displayed) Engine.miniMap.map.updatePins();
    },

    updateBuildingMarkers: function(markers){
        this.buildingMarkers = markers;
        this.updateEvents.add('map');
        // if(Engine.miniMap.displayed) Engine.miniMap.map.updatePins();
    },

    updateResourceMarkers: function(markers){
        this.resourceMarkers = markers;
        this.updateEvents.add('map');
        // if(Engine.miniMap.displayed) Engine.miniMap.map.updatePins();
    },

    updateDeathMarkers: function(markers){
        this.deathMarkers = markers;
        this.updateEvents.add('map');
        // if(Engine.miniMap.displayed) Engine.miniMap.map.updatePins();
    },

    updateConflictMarkers: function(markers){
        this.conflictMarkers = markers;
        this.updateEvents.add('map');
        // if(Engine.miniMap.displayed) Engine.miniMap.map.updatePins();
    },

    // updateRarity: function(rarity){
    //     Engine.rarity = {};
    //     rarity.forEach(function(itm){
    //         Engine.rarity[itm[0]] = itm[1];
    //     });
    // },

    updateStats: function(stats){
        for(let i = 0; i < stats.length; i++){
            this.updateStat(stats[i].k,stats[i]);
        }
        this.updateEvents.add('stats');
        // TODO: add sound effect
    },

    updateStat: function(key,data){
        let statObj = this.getStat(key);
        statObj.setBaseValue(data.v);
        statObj.relativeModifiers = [];
        statObj.absoluteModifiers = [];
        if(data.r){
            data.r.forEach(function(m){
                statObj.relativeModifiers.push(m);
            })
        }
        if(data.a){
            data.a.forEach(function(m){
                statObj.absoluteModifiers.push(m);
            })
        }
    },

    updateVigor: function(vigor){
        this.vigor = vigor;
        this.updateEvents.add('vigor');
    }
});

export default Hero