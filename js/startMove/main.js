window.onload = function(){
 
    
odiv=document.getElementsByTagName('div')[0];

odiv.onclick=function(){
    startMove(odiv,{left:300},function(){
        startMove(odiv,{left:0})
    }

    )
}

           
        
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