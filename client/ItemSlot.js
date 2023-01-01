/**
 * Created by Jerome Renaux (jerome.renaux@gmail.com) on 24-03-19.
 */
import Engine from './Engine'
import Frame from './Frame'
import Inventory from '../shared/Inventory'
import {Stats} from "../shared/Stats";
import UI from './UI'
import Utils from '../shared/Utils'

import itemsData from '../assets/data/items.json' assert { type: 'json' }

function ItemSlot(x,y,width,height){
    Frame.call(this,x,y,width,height);

    this.name = UI.scene.add.text(this.x + 60, this.y + 10, '', { font: '16px '+Utils.fonts.fancy, fill: '#ffffff', stroke: '#000000', strokeThickness: 3 });

    this.zone = UI.scene.add.zone(this.x,this.y,width,height);
    this.zone.setInteractive();
    this.zone.setOrigin(0);
    this.zone.on('pointerover',function(){
        if(this.checkForPanelOnTop()) return;
        UI.tooltip.updateInfo('item',{id:this.itemID});
        UI.tooltip.display();
        UI.setCursor('item');
    }.bind(this));
    this.zone.on('pointerout',function(){
        if(this.checkForPanelOnTop()) return;
        UI.tooltip.hide();
        UI.setCursor();
    }.bind(this));

    this.content = [this.name, this.zone];

    this.addItem();
    this.addPrice();
    this.addRarity();
    this.addInventoryCount();
    this.addEffect();
}

ItemSlot.prototype = Object.create(Frame.prototype);
ItemSlot.prototype.constructor = ItemSlot;

ItemSlot.prototype.addItem = function(){
    this.slot = UI.scene.add.sprite(this.x + 30,this.y+this.height/2,'UI','equipment-slot');
    this.icon = UI.scene.add.sprite(this.x + 30, this.y + this.height/2);
    this.content.push(this.slot);
    this.content.push(this.icon);
};

ItemSlot.prototype.addInventoryCount = function(){
    this.bagicon = UI.scene.add.sprite(this.x + 19, this.y + this.height - 12, 'UI','smallpack');
    this.nb = UI.scene.add.text(this.x + 29, this.y + this.height - 22, '999', { font: '12px '+Utils.fonts.fancy, fill: '#ffffff', stroke: '#000000', strokeThickness: 3 });
    this.content.push(this.bagicon);
    this.content.push(this.nb);
};

ItemSlot.prototype.addPrice = function(){
    this.goldicon = UI.scene.add.sprite(this.x + this.width - 12, this.y + 16, 'UI','gold');
    this.price = UI.scene.add.text(this.x + this.width - 22, this.y + 6, '', { font: '12px '+Utils.fonts.fancy, fill: '#ffffff', stroke: '#000000', strokeThickness: 3 });
    this.price.setOrigin(1,0);
    this.content.push(this.goldicon);
    this.content.push(this.price);
};

ItemSlot.prototype.addEffect = function(){
    this.staticon = UI.scene.add.sprite(this.x + 70, this.y + 45, 'UI');
    this.effect = UI.scene.add.text(this.x + 83, this.y + 35, '', { font: '14px '+Utils.fonts.fancy, fill: '#ffffff', stroke: '#000000', strokeThickness: 3 });
    this.content.push(this.staticon);
    this.content.push(this.effect);
};

ItemSlot.prototype.addRarity = function(){
    this.rarity = UI.scene.add.text(this.x + 60, this.y + 60, '', { font: '12px '+Utils.fonts.fancy, fill: '#ffffff', stroke: '#000000', strokeThickness: 3 });
    this.content.push(this.rarity);
};

ItemSlot.prototype.checkForPanelOnTop = function(){
    return (Engine.currentMenu.isPanelDisplayed('prices') 
    || Engine.currentMenu.isPanelDisplayed('goldaction')
    || Engine.repairPanel.displayed
    || Engine.repairAction.displayed
    );
};

ItemSlot.prototype.setUp = function(action,item){
    if(!this.displayed) console.warn('Setting up slot before displaying it');
    var itemData = itemsData[item];
    this.icon.setTexture(itemData.atlas,itemData.frame);
    this.name.setText(itemData.name);
    this.desc = itemData.desc;
    this.itemID = item;
    this.nb.setText(Engine.player.getItemNb(item));

    function computeRarity(count){
        if(count <= 1){
            return 'Extremely rare';
        }else if(count <= 10){
            return 'Rare';
        }else if(count <= 100){
            return 'Common';
        }else{
            return 'Very common';
        }
    }

    // TODO: more cleanly
    var items = new Inventory().fromList(Engine.player.regionsStatus[Engine.player.region].items);
    var rarity = computeRarity(items.getNb(item) || 0);
    this.rarity.setText(rarity);
    this.rarity.setFill((['Extremely rare','Rare'].includes(rarity) ? Utils.colors.gold : Utils.colors.white));

    var priceaction = (action == 'buy' ? 'sell' : 'buy');
    var price = Engine.currentBuiling.getPrice(item,priceaction);
    if(price == 0) {
        this.price.setText('--');
        this.price.setFill(Utils.colors.white);
    }else{
        this.price.setText(price);
        if (action == 'sell') {
            this.price.setFill((price > Engine.currentBuiling.gold ? Utils.colors.red : Utils.colors.white));
        } else {
            this.price.setFill((price > Engine.player.gold ? Utils.colors.red : Utils.colors.white));
        }
    }

    if(itemData.hasOwnProperty('effects')) {
        this.hasEffect = true;
        for (var stat in itemData.effects) {
            this.staticon.setFrame(Stats[stat].frame);
            var effect = itemData.effects[stat];
            var stattext = effect;
            if(effect > 0) stattext = '+'+stattext;
            this.effect.setText(stattext);

            var equipped = Engine.player.getEquippedItemID(itemData.equipment);
            if(equipped > -1 && itemsData[equipped].effects) {
                var current = itemsData[equipped].effects[stat];
                if(current > effect){
                    this.effect.setFill(Utils.colors.red);
                }else if(current < effect){
                    this.effect.setFill(Utils.colors.green);
                }else{
                    this.effect.setFill(Utils.colors.gold);
                }
            }else{
                this.effect.setFill(Utils.colors.green);
            }
        }
    }else{
        this.hasEffect = false;
    }
    
    if(!this.hasEffect) {
        this.staticon.setVisible(false);
        this.effect.setVisible(false);
    }
};

ItemSlot.prototype.display = function(){
    Frame.prototype.display.call(this);
    this.content.forEach(function(c){
        c.setVisible(true);
    });
};

ItemSlot.prototype.hide = function(){
    Frame.prototype.hide.call(this);
    this.content.forEach(function(c){
        c.setVisible(false);
    });
};

export default ItemSlot
