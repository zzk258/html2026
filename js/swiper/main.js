window.onload = function(){
 
    


var focus=document.querySelector('.focus');
var ul=focus.querySelector('ul');
var ol=focus.querySelector('ol');
var pre=focus.querySelector('.pre');
var next=focus.querySelector('.next');

var colorA=['red','yellow','blue'];


var focusWidth=parseInt(getStyle(focus,'width'))
//动态生成小圆点
for(var i=0;i<ul.children.length;i++){
    ul.children[i].style.background=colorA[i%3]
    //console.log(1)
    var addli=document.createElement('li'); 
    addli.setAttribute('index',i);
    ol.appendChild(addli);
   // ol.children[i].index=i;
    ol.children[i].addEventListener('click',function(){
        var getIndex=(this.getAttribute('index'));

        var step = focusWidth * getIndex;

        startMove(ul,{left:-step});

        for(var i=0;i<ol.children.length;i++){
            ol.children[i].className='';
        }
        this.className="current";
    })
}

 
//设置第一个li 类名为： current
ol.children[0].className='current';

//克隆第一张插到最后,便于动态增加 ul > li ，因为圆点已生成完毕，这里不会添加小圆点
var first = ul.children[0].cloneNode(true);
ul.appendChild(first);

var num=0;
next.addEventListener('click',function(){
    if(num>=ul.children.length-1){
        ul.style.left=0+'px';
        num=0;
    }
        num++;
    startMove(ul,{left:-num*focusWidth}); 
})


pre.addEventListener('click',function(){
    if(num<=0){
        ul.style.left=focusWidth*(ul.children.length-1)+'px';
        num=ul.children.length-1;
    }
        num--;
    startMove(ul,{left:-num*focusWidth}); 
})



















function getStyle(obj,attr){
            return getComputedStyle ? getComputedStyle(obj,false)[attr] : obj.currentStyle[attr];
        }
        function startMove(obj,json,fn) {
            clearInterval(obj.timer);
            obj.timer = setInterval(function () {
                var bStop = true;
                for(attr in json){
                    // 1. 取得当前的值（可以是widht，height，opacity等的值）
                    var objAttr = 0;
                    if(attr == "opacity"){
                        objAttr = Math.round(parseFloat(getStyle(obj,attr))*100);
                    }else{
                        objAttr = parseInt(getStyle(obj,attr));
                    }
                    // 2.计算运动速度
                    var iSpeed = (json[attr] -objAttr)/10;
                        iSpeed = iSpeed>0 ?Math.ceil(iSpeed):Math.floor(iSpeed);
                    // 3. 检测所有运动是否到达目标
                    if(objAttr != json[attr]){
                        bStop = false;
                    }
                    if(attr == "opacity"){
                        obj.style.filter = 'alpha(opacity:'+(objAttr+iSpeed)+')';
                        obj.style.opacity = (objAttr+iSpeed)/100;
                    }else{
                        obj.style[attr] =  objAttr+iSpeed+'px';// 需要又.属性名的形式改成[]
                    }
                }
                if(bStop){ // 表示所有运动都到达目标值
                    clearInterval(obj.timer);
                    if(fn){
                        fn();
                    }
                }
            },30);
        }


  
  
}