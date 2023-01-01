/**
 * Created by Jerome Renaux (jerome.renaux@gmail.com) on 06-12-18.
 */
var expect = require('chai').expect;
var request = require('request');
var io = require('socket.io');
var path = require('path');
var sinon = require('sinon');
var mongoose = require('mongoose');

var mapsDir = path.join(__dirname,'..','maps');
var Equipment = require('../shared/Equipment.js').Equipment;

import GameServer from '../server/GameServer'

/*
* WARNING: tests are run in parallel, which can cause them to interfere with each
* other; use different item ID's when testing inventory to avoid issues.
* */


// describe('test', function(){
//     /*The stub essentially suppresses the call to a method, while allowing to check if it was called
//     * and with what arguments. It doesn't provide a mock return value!*/
//     it('stub-test',function() {
//         var methodB = sinon.stub(gs, 'testMethodB');
//         var input = 5;
//         var output = GameServer.testMethodA(input);
//         expect(output).to.equal(input);
//         methodB.restore();
//         sinon.assert.calledWith(methodB, input);
//     });
// });

describe('GameServer',function(){
    var stubs = [];
    before(function(done) {
        this.timeout(10000);
        mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/westward', { useNewUrlParser: true });
        var db = mongoose.connection;
        db.on('error', console.error.bind(console, 'connection error:'));
        db.once('open', function() {
            console.log('Connection to db established');
            // TODO: read from config
            GameServer.readMap(mapsDir,false,done);
            GameServer.server = {
                getNbConnected: function(){},
                sendError: function(){},
                sendInitializationPacket: function(){},
                sendUpdate: function(){}
            };
        });
    });

    var player;
    it('addNewPlayer',function(){
        var errInputs = [{},{new:true}];
        errInputs.forEach(function(input){
            var result = GameServer.addNewPlayer(null,input);
            expect(result).to.equal(null);
        });

        var name = 'Test';
        var region = 2;
        var dummySocket = {id:'socket123',dummy: true};
        player = GameServer.addNewPlayer(dummySocket,{characterName:name, selectedRegion: region});
        player.setSocketID(dummySocket.id);
        player.spawn(20,20);
        expect(GameServer.getPlayer(dummySocket.id).id).to.equal(player.id);
        expect(player.socketID).to.equal(dummySocket.id);
        expect(player.name).to.equal(name);
        expect(player.origin).to.equal(region);
        expect(player.region).to.equal(region);

        // Check if all default equipments are equipped
        for(var slot in Equipment.slots){
            var eq = Equipment.slots[slot];
            if(eq.defaultItem) expect(player.getEquippedItemID(slot)).to.equal(eq.defaultItem);
        }
    });

    var animal;
    var animalFarAway;
    it('addAnimal', function(){
        var x = player.x - 3;
        var y = player.y - 3;
        var type = 0;
        animal = GameServer.addAnimal(x,y,type);
        animalFarAway = GameServer.addAnimal(0,0,0);
        expect(animal.x).to.equal(x);
        expect(animal.y).to.equal(y);
        expect(animal.type).to.equal(type);
    });

    it('handleBattle_faraway',function(){
        var result = GameServer.handleBattle(player,animalFarAway);
        expect(result).to.equal(false);
    });

    it('handleBattle_alive',function(){
        var result = GameServer.handleBattle(player,animal);
        expect(result).to.equal(true);
        player.battle.end();
    });

    it('lootNPC_alive',function(){
        var result = GameServer.lootNPC(player,'animal',animal.id);
        expect(result).to.equal(false);
    });

    it('animalDie',function(){
       animal.die();
        expect(animal.idle).to.equal(false);
        expect(animal.dead).to.equal(true);
    });

    it('handleBattle_dead',function(){
        var result = GameServer.handleBattle(player,animal);
        expect(result).to.equal(false);
    });

    it('lootNPC_dead',function(){
        var lootTable = GameServer.animalsData[animal.type].loot;
        var itemID = Object.keys(lootTable)[0];
        var nb = lootTable[itemID][0];
        var initNb = player.getItemNb(itemID);
        var result = GameServer.lootNPC(player,'animal',animal.id);
        expect(result).to.equal(true);
        // expect(player.getItemNb(itemID)).to.equal(initNb+nb); // removed for now since non-deterministic output
    });

    var item;
    it('addItem', function(){
        var x = player.x + 3;
        var y = player.y - 3;
        var type = 1;
        item = GameServer.addItem(x,y,type);
        expect(item.x).to.equal(x);
        expect(item.y).to.equal(y);
        expect(item.type).to.equal(type);
    });

    it('pickUpItem', function(){
        var initNb = player.getItemNb(item.type);
        GameServer.pickUpItem(player,item.id);
        expect(player.getItemNb(item.type)).to.equal(initNb+1);
    });

    var building;
    it('addBuilding', function(){
        var data = {
            x: player.x - 10,
            y: player.y - 10,
            type: 4 // shop
        };
        building = GameServer.addBuilding(data);
        expect(building.x).to.equal(data.x);
        expect(building.y).to.equal(data.y);
        expect(building.type).to.equal(data.type);
    });

    it('Building_updateProd', function(){
        var data = {
            x: 0,
            y: 0,
            type: 6 // Lumber camp
        };
        var bld = GameServer.addBuilding(data);
        var initNb = bld.getItemNb(3);
        var nbProduced = bld.updateProd();
        // For now, just test that in doesn't crash
        expect(nbProduced).to.equal(true);
        expect(bld.getItemNb(3)).to.equal(initNb+1);
    });

    it('countOwnedBuildings', function(){
        expect(player.countOwnedBuildings(building.type)).to.equal(0);
        player.addBuilding(building);
        expect(player.countOwnedBuildings(building.type)).to.equal(1);
        player.buildings = [];
    });

    it('updateBldRecipes', function(){
        player.updateBldRecipes();
        var nbrecipes = player.bldRecipes.length;
        var nbOwned = player.countOwnedBuildings(building.type);
        player.addBuilding(building);
        expect(player.countOwnedBuildings(building.type)).to.equal(nbOwned+1);
        expect(player.bldRecipes.length).to.equal(nbrecipes-1);
    });

    it('handleShop_out', function(){
        // Should fail because the player is not in the building
        var result = GameServer.handleShop({},player.socketID);
        expect(result).to.equal(false);
    });

    it('enterBuilding',function(){
        var result = player.enterBuilding(building.id);
        expect(result).to.equal(true);
    });

    it('building_giveItem',function(){
        var itemID = 1;
        var nb = 3;
        var initNb = building.getItemNb(itemID);
        building.giveItem(itemID,nb);
        expect(building.getItemNb(itemID)).to.equal(initNb+nb);
    });

    it('setBuildingPrices',function(){
        building.owner = player.id;
        var itemID = 1;
        var buy = 10;
        var sell = 20;
        GameServer.setBuildingPrice({item:itemID,buy:buy,sell:sell},player.socketID);
        expect(building.getPrice(itemID,1,'buy')).to.equal(buy);
        expect(building.getPrice(itemID,1,'sell')).to.equal(sell);
    });

    it('handleShop_owner', function(){
        player.inventory.clear();
        building.inventory.clear();
        var nonstoredID = 1;
        var storedID = 5;
        var nonownedID = 3;
        var ownedID = 4;
        building.giveItem(storedID,1);
        player.giveItem(ownedID,1);
        var playerGoldBefore = player.getGold();
        var buildingGoldBefore = building.getGold();
        var testCases = [
            {in: {action:'buy',id:nonstoredID,nb:1},out:false},
            {in: {action:'buy',id:storedID,nb:1},out:true},
            {in: {action:'sell',id:nonownedID,nb:1},out:false},
            {in: {action:'sell',id:ownedID,nb:1},out:true},
        ];
        testCases.forEach(function(testcase){
            var result = GameServer.handleShop(testcase.in,player.socketID);
            expect(result).to.equal(testcase.out);
        });
        expect(player.getItemNb(storedID)).to.equal(1);
        expect(player.getItemNb(ownedID)).to.equal(0);
        expect(building.getItemNb(storedID)).to.equal(0);
        expect(building.getItemNb(ownedID)).to.equal(1);
        expect(player.getGold()).to.equal(playerGoldBefore);
        expect(building.getGold()).to.equal(buildingGoldBefore);
    });

    it('handleShop_nonowner', function(){
        player.inventory.clear();
        building.inventory.clear();
        building.owner = -1;
        var ownedID = 1;
        var storedID = 2;
        var buyPrice = 10;
        var sellPrice = 15;
        building.giveItem(storedID,1);
        player.giveItem(ownedID,1);
        building.setPrices(storedID,0,sellPrice);
        building.setPrices(ownedID,buyPrice,0);
        var playerGoldBefore = player.getGold();
        var buildingGoldBefore = building.getGold();
        var testCases = [
            {in: {action:'buy',id:storedID,nb:1},out:true},
            {in: {action:'sell',id:ownedID,nb:1},out:true},
        ];
        testCases.forEach(function(testcase){
            var result = GameServer.handleShop(testcase.in,player.socketID);
            expect(result).to.equal(testcase.out);
        });
        expect(player.getItemNb(storedID)).to.equal(1);
        expect(player.getItemNb(ownedID)).to.equal(0);
        expect(building.getItemNb(storedID)).to.equal(0);
        expect(building.getItemNb(ownedID)).to.equal(1);
        // Removed for now due to possible non-deterministic output
        // expect(player.getGold()).to.equal(playerGoldBefore-sellPrice+buyPrice);
        // expect(building.getGold()).to.equal(buildingGoldBefore-buyPrice+sellPrice);
    });

    it('handleGold_owner', function(){
        building.owner = player.id;
        player.gold = 150;
        var playerGoldBefore = player.getGold();
        var buildingGoldBefore = building.getGold();
        var giveAmount = 10;
        var takeAmount = -5;
        GameServer.handleGold({nb:giveAmount},player.socketID);
        expect(player.getGold()).to.equal(playerGoldBefore - giveAmount);
        expect(building.getGold()).to.equal(buildingGoldBefore + giveAmount);
        GameServer.handleGold({nb:takeAmount},player.socketID);
        expect(player.getGold()).to.equal(playerGoldBefore - giveAmount - takeAmount);
        expect(building.getGold()).to.equal(buildingGoldBefore + giveAmount + takeAmount);
    });

   it('handleGold_nonowner', function(){
        building.owner = -1;
        player.gold = 150;
        var playerGoldBefore = player.getGold();
        var buildingGoldBefore = building.getGold();
        var giveAmount = 10;
        var takeAmount = -5;
        GameServer.handleGold({nb:giveAmount},player.socketID);
        expect(player.getGold()).to.equal(playerGoldBefore);
        expect(building.getGold()).to.equal(buildingGoldBefore);
        GameServer.handleGold({nb:takeAmount},player.socketID);
        expect(player.getGold()).to.equal(playerGoldBefore);
        expect(building.getGold()).to.equal(buildingGoldBefore);
    });

    it('handleUse_consume', function(){
        player.inventory.clear();
        var itemID = 6; // dawn
        var amount = 1;
        player.giveItem(itemID,amount);
        expect(player.getItemNb(itemID)).to.equal(amount);
        GameServer.handleUse({item:itemID,inventory:'backpack'},player.socketID);
        expect(player.getItemNb(itemID)).to.equal(amount-1);

        player.addToBelt(itemID,amount);
        expect(player.getItemNbInBelt(itemID)).to.equal(amount);
        GameServer.handleUse({item:itemID,inventory:'belt'},player.socketID);
        expect(player.getItemNbInBelt(itemID)).to.equal(amount-1);
    });

    it('handleUse_equip', function(){
        player.inventory.clear();
        var type = 11; // sword
        var typeNotOwned = 2; // bow
        var slot = GameServer.itemsData[type].equipment;
        var slotNotOwned = GameServer.itemsData[typeNotOwned].equipment;
        player.giveItem(type,1);
        expect(player.isEquipped(slot)).to.equal(false);
        expect(player.isEquipped(slotNotOwned)).to.equal(false);
        GameServer.handleUse({item:type,inventory:'backpack'},player.socketID);
        GameServer.handleUse({item:typeNotOwned,inventory:'backpack'},player.socketID);
        expect(player.isEquipped(slot)).to.equal(true);
        expect(player.getEquippedItemID(slot)).to.equal(type);
        expect(player.isEquipped(slotNotOwned)).to.equal(false);
    });

    it('handleCraft',function(){
        var item = 43;
        var data = {
            x: player.x - 10,
            y: player.y + 10,
            type: 3 // workshop
        };
        var workshop = GameServer.addBuilding(data);
        expect(GameServer.handleCraft({},player.socketID)).to.equal(false); // not in building
        player.inBuilding = workshop.id;
        expect(GameServer.handleCraft({id:item},player.socketID)).to.equal(false); // no ingredients
        for(var ingredient in GameServer.itemsData[item].recipe){
            player.giveItem(ingredient, GameServer.itemsData[item].recipe[ingredient]);
        }
        var ownedBefore = player.getItemNb(item);
        // console.log('inventory:',player.inventory.toList());
        expect(GameServer.handleCraft({id:item},player.socketID)).to.equal(true);
        expect(player.getItemNb(item)).to.equal(ownedBefore+GameServer.itemsData[item].output);
    });

    /**
     * Try to equip every single item possible, using good and bad inputs.
     * Only tests equip here, doesn't check for changes in inventory numbers 
     * (see subsequent test for that)
     */
    it('Player_equip', function(){
        var slots = Object.keys(Equipment.slots);

        for(var itemID in GameServer.itemsData){
            var item = GameServer.itemsData[itemID];
            var properSlot = item.equipment;
            if(item.permanent) continue; // don't try to equip fists, hands...
            if(!properSlot) continue;
            var slotid = slots.indexOf(properSlot); 
            var wrongSlot = slotid > 0 ? slots[slotid - 1] : slots[slotid + 1];
            // console.log('#',itemID,item,properSlot);
            console.warn('equipping',itemID,'in',properSlot);
            // Because in isolation, equipping ammo should always fail due to the lack
            // of proper container
            var expectedResult = (properSlot == 'range_ammo' ? 0 : 1);
            expect(player.equip(properSlot,parseInt(itemID),true)).to.equal(expectedResult);
            expect( player.equip(properSlot,item,true)).to.equal(0); // try sending the item data instead of id
            expect(player.equip(wrongSlot,parseInt(itemID),true)).to.equal(0);
            expectedResult = (properSlot == 'range_ammo' ? -1 : parseInt(itemID));
            expect(player.getEquippedItemID(properSlot)).to.equal(expectedResult);
            player.unequip(properSlot);
        }
    });

    it('equipment_management',function(){
        player.inventory.clear();
        var weaponID = 28; // stone hatchet
        var itemData = GameServer.itemsData[weaponID];
        var slot = itemData.equipment;
        player.giveItem(weaponID, 1);
        expect(player.getItemNbInBelt(weaponID)).to.equal(0);
        var initNb = player.getItemNb(weaponID);
        GameServer.handleUse({item:weaponID,inventory:'backpack'},player.socketID);
        expect(player.getItemNb(weaponID)).to.equal(initNb-1);
        expect(player.isEquipped(slot)).to.equal(true);
        expect(player.getEquippedItemID(slot)).to.equal(parseInt(weaponID));
        player.unequip(slot);
        expect(player.getItemNb(weaponID)).to.equal(initNb);
        expect(player.isEquipped(slot)).to.equal(false);

        player.backpackToBelt(weaponID);
        expect(player.getItemNb(weaponID)).to.equal(0);
        expect(player.getItemNbInBelt(weaponID)).to.equal(initNb);
        GameServer.handleUse({item:weaponID,inventory:'belt'},player.socketID);
        expect(player.isEquipped(slot)).to.equal(true);
        expect(player.getEquippedItemID(slot)).to.equal(parseInt(weaponID));
        expect(player.getItemNbInBelt(weaponID)).to.equal(initNb-1);
        player.unequip(slot);
        expect(player.getItemNb(weaponID)).to.equal(1);
        expect(player.getItemNbInBelt(weaponID)).to.equal(initNb-1);
        expect(player.isEquipped(slot)).to.equal(false);
    });

    it('equipment_stats',function(){
        var weaponID = 28;
        var itemData = GameServer.itemsData[weaponID];
        var slot = itemData.equipment;
        var stat = Object.keys(itemData.effects)[0]; // pick up first stat affected by item
        var effect = itemData.effects[stat];
        player.giveItem(weaponID, 1);
        player.unequip(slot); // unequip anything that may have been equipped in a previous test
        player.getStat(stat).clearRelativeModifiers();
        var initialValue = player.getStat(stat).getValue();
        GameServer.handleUse({item:weaponID,inventory:'backpack'},player.socketID);
        expect(player.getStat(stat).getValue()).to.equal(initialValue + effect);
    });

    it('Player_load',function(){
        var initNbAmmo = player.getNbAmmo();
        var increment = 10;
        player.load(increment);
        expect(player.getNbAmmo()).to.equal(initNbAmmo+increment);
    });

    it('Bow_kit_from_belt',function(){
        var rangedID = 2; // bow
        var containerID = 19; // quiver
        var ammoID = 20; // arrow

        player.giveItem(rangedID, 1);
        player.giveItem(ammoID, 1000); // in order to max capacity
        player.giveItem(containerID, 1);

        player.backpackToBelt(ammoID);
        GameServer.handleUse({item:rangedID,inventory:'backpack'},player.socketID);
        GameServer.handleUse({item:containerID,inventory:'backpack'},player.socketID);

        player.unload();
        var initNbAmmo = player.getNbAmmo();
        expect(initNbAmmo).to.equal(0);
        GameServer.handleUse({item:ammoID,inventory:'belt'},player.socketID);
        expect(player.getNbAmmo()).to.equal(initNbAmmo+GameServer.itemsData[containerID].capacity);
    });

    it('Stones_kit_from_belt',function(){
        var containerID = 51; // Small projectiles pouch
        var ammoID = 26; // Stone

        player.unequip('rangedw');
        player.giveItem(ammoID, 1000); // in order to max capacity
        player.giveItem(containerID, 1);

        player.backpackToBelt(ammoID);
        GameServer.handleUse({item:containerID,inventory:'backpack'},player.socketID);

        player.unload();
        var initNbAmmo = player.getNbAmmo();
        expect(initNbAmmo).to.equal(0);
        GameServer.handleUse({item:ammoID,inventory:'belt'},player.socketID);
        expect(player.getNbAmmo()).to.equal(initNbAmmo+GameServer.itemsData[containerID].capacity);
    });

   
    after(function(){
        stubs.forEach(function(stub){
            stub.restore();
        })
    });
});

/*
describe('Server', function () {
    return;
    /!*var client;
    before('socket-client',function(){
        client = io('http://localhost:'+PORT); // https://github.com/agconti/socket.io.tests/blob/master/test/test.js
    });*!/

    it('Run', function (done) {
        request('http://localhost:'+PORT, function(error, response, body) {
            expect(response.statusCode).to.equal(200);
            done();
        });
    });

    var client;
    it('io-connection',function(done){
        client = io('http://localhost:'+PORT); // https://github.com/agconti/socket.io.tests/blob/master/test/test.js
        client.on('ack',function(){
            expect(true).to.equal(true);
            done();
        });
    });

    it('io-init-world-errs',function(done) {
        var errInputs = [{},{new:true}];
        var nbEvts = 0;
        var nbErrs = 0;
        var onevent = client.onevent;
        client.onevent = function (packet) {
            nbEvts++;
            if (packet.data[0] == 'serv-error') nbErrs++;
            if (nbEvts == errInputs.length) {
                expect(nbErrs).to.equal(nbEvts);
                done();
            }
            //onevent.call(this, packet);    // original call
        };
        errInputs.forEach(function(input){
            client.emit('init-world',input);
        });
    });
});*/
