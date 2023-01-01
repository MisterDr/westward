/**
 * Created by Jerome on 20-11-17.
 // */
import BigButton from './BigButton'
import Client from './Client'
import Engine from './Engine'
import IngredientSlot from './IngredientSlot'
import Panel from './Panel'
import UI from './UI'
import Utils from '../shared/Utils'


import abilitiesData from '../assets/data/abilities'
import itemsData from '../assets/data/items.json' assert { type: 'json' }


function CraftingPanel(x,y,width,height,title){
    Panel.call(this,x,y,width,height,title);
    this.buttons = [];
    this.addInterface();
    this.lastCraft = Date.now();

}

CraftingPanel.prototype = Object.create(Panel.prototype);
CraftingPanel.prototype.constructor = CraftingPanel;

CraftingPanel.prototype.isFinancial = function(){
    return !Engine.currentBuiling.isOwned();
};

CraftingPanel.prototype.addInterface = function(){
    this.craftSlot = new IngredientSlot(this.x+115,this.y+30,320,80,true); // true = show price
    this.craftSlot.hide();

    this.noitem = this.addText(this.width/2,80,'Select a recipe to begin',Utils.colors.white,16);
    this.noitem.setOrigin(0.5);

    this.ingredientSlots = [];
    var w = 250;
    for(var i = 0; i < 4; i++){
        var x = this.x + 15 + +(i%2)*(w+10);
        var y = this.y + 150 + Math.floor(i/2)*90;
        var slot = new IngredientSlot(x,y,w,80);
        slot.hide();
        this.ingredientSlots.push(slot)
    }

    var count = UI.scene.add.text(this.x+this.width/2,this.y+130, '1',  { font: '16px belwe', fill: '#ffffff', stroke: '#000000', strokeThickness: 3 });
    count.setOrigin(0.5,0.5);
    count.setVisible(false);
    count.setDepth(2);
    count.setScrollFactor(0);
    this.content.push(count);
    this.countText = count;

    this.okBtn = new BigButton(this.x + this.width/2,this.y + 350,'Craft',this.requestCraft.bind(this));
    this.okBtn.hide();

    this.abilityneeded = this.addText(this.width/2,this.y + 380,'',Utils.colors.red,16);
    this.abilityneeded.setOrigin(0.5);

    // this.addButton(x+92,y+13,'green','ok',this.requestCraft.bind(this),'Craft');
    this.minusBtn = this.addButton(count.x - this.x - 35,count.y - this.y - 10, 'blue','minus',this.decreaseAmount.bind(this),'Decrease').btn;
    this.plusBtn = this.addButton(count.x - this.x + 13,count.y - this.y - 10, 'blue','plus',this.increaseAmount.bind(this),'Increase').btn;

    this.craftItem = {
        id: -1,
        count: 0,
        price: 0,
        recipe: null
    };
};

CraftingPanel.prototype.display = function(){
    Panel.prototype.display.call(this);
    this.displayInterface();
};

CraftingPanel.prototype.displayInterface = function(){
     this.buttons.forEach(function(b){
         b.btn.disable();
     });
     this.hideButtons();
    this.noitem.setVisible(true);
};

CraftingPanel.prototype.getPrice = function(){
    return Engine.currentBuiling.getPrice(this.craftItem.id, 'sell');
};

CraftingPanel.prototype.setUp = function(itemID){
    var data = itemsData[itemID];
    this.craftItem.id = itemID;
    this.craftItem.count = 1;
    this.craftItem.recipe = data.recipe;
    this.craftItem.price = this.getPrice();

    this.craftSlot.display();
    this.craftSlot.setUp(itemID,-1);
    this.noitem.setVisible(false);
    this.displayButtons();

    this.updateIngredients();

    this.countText.setVisible(true);

    var output = (itemsData[this.craftItem.id].output || 1);
    this.countText.setText(this.craftItem.count*output);

    this.okBtn.display();

    this.manageButtons();

    if(data.ability) this.abilityneeded.setText(abilitiesData[data.ability].name+' ability needed');
    var lackingAbility = (data.ability && !Engine.player.hasAbility(data.ability));
    this.abilityneeded.setVisible(lackingAbility);
};

CraftingPanel.prototype.updateIngredients = function(){
    if(this.craftItem.id == -1) return;
    this.craftSlot.setUp(this.craftItem.id,-1);

    var data = itemsData[this.craftItem.id];

    this.ingredientSlots.forEach(function(slot){
        slot.hide();
    });
    var i = 0;
    for(var ing in data.recipe){
        var slot = this.ingredientSlots[i++];
        slot.display();
        slot.setUp(ing,data.recipe[ing]*this.craftItem.count);
    }

    this.craftItem.price = this.craftItem.count*this.getPrice();
    this.manageButtons();
};

CraftingPanel.prototype.manageButtons = function(){

    if(this.craftItem.count == 1){
        this.minusBtn.disable();
    }else{
        this.minusBtn.enable();
    }

    if(this.craftItem.count == 999){
        this.plusBtn.disable();
    }else{
        this.plusBtn.enable();
    }

    if(Engine.player.canCraft(this.craftItem.id, this.craftItem.count)
    && (!this.isFinancial() || Engine.player.gold >= this.craftItem.price)){
        this.okBtn.enable();
    }else{
        this.okBtn.disable();
    }

    this.buttons.last().btn.enable();
};

CraftingPanel.prototype.increaseAmount = function(){
    this.changeAmount(1);
};

CraftingPanel.prototype.decreaseAmount = function(){
    this.changeAmount(-1);
};

CraftingPanel.prototype.changeAmount = function(inc){
    var output = (itemsData[this.craftItem.id].output || 1);
    this.craftItem.count = Utils.clamp(this.craftItem.count+inc,1,999);
    this.craftItem.price = this.craftItem.count*this.getPrice();
    this.countText.setText(this.craftItem.count*output);
    this.updateIngredients();
    this.manageButtons();
};

CraftingPanel.prototype.hide = function(){
    Panel.prototype.hide.call(this);
    this.craftSlot.hide();
    this.ingredientSlots.forEach(function(slot){
        slot.hide();
    });
    this.okBtn.hide();
    this.reset();
};

CraftingPanel.prototype.reset = function(){
    this.craftItem.id = -1;
    this.craftItem.count = 0;
    this.craftItem.recipe = null;
};

CraftingPanel.prototype.requestCraft = function(){
    if(Date.now() - this.lastCraft < 200) return;
    Client.sendCraft(this.craftItem.id,this.craftItem.count);
    this.lastCraft = Date.now();
};

export default CraftingPanel
