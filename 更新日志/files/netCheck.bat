@echo off
setlocal enabledelayedexpansion
cls
:MENU
echo ==============================================
echo          Windows综合网络诊断工具【菜单版】
echo ==============================================
echo 【提示】部分检测需要管理员权限运行，否则结果不准
echo  1. 普通基础诊断（IP/网关/DNS/外网/网卡/tracert）
echo  2. IP冲突专项诊断（4198日志 + ARP辅助探测）
echo  3. 网络风暴专项辅助评估
echo  4. 网关ARP / ARP欺骗风险核查
echo  5. Windows防火墙状态核查
echo  0. 退出程序
echo ==============================================
set /p "CHOICE=请输入选择数字并回车："

if "%CHOICE%"=="1" goto BASE_DIAG
if "%CHOICE%"=="2" goto IP_CONFLICT_DIAG
if "%CHOICE%"=="3" goto STORM_DIAG
if "%CHOICE%"=="4" goto ARP_GW_DIAG
if "%CHOICE%"=="5" goto FW_DIAG
if "%CHOICE%"=="0" goto EXIT
echo 输入无效，请重新选择！
timeout /t 1 >nul
cls
goto MENU

:: ====================== 1. 普通基础诊断 ======================
:BASE_DIAG
cls
echo ==============================================
echo           【基础诊断：IP、网关、DNS、外网连通】
echo ==============================================
echo.
echo [1] 获取本机IPv4、网关信息
echo ----------------------------------------------
ipconfig | findstr /i "IPv4 网关 MAC"
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /r "IPv4.*[0-9]*\.[0-9]*\.[0-9]*\.[0-9]*"') do set LOCAL_IP=%%i
for /f "tokens=2 delims=:" %%g in ('ipconfig ^| findstr /i "默认网关"') do set GW=%%g
set LOCAL_IP=!LOCAL_IP: =!
set GW=!GW: =!
echo 本机IP：!LOCAL_IP!
echo 网关：!GW!
echo 【分析依据】读取ipconfig获取基础组网参数
echo.

echo [2] 网关连通测试
echo ----------------------------------------------
ping -n 2 !GW! >nul
if !errorlevel! neq 0 (
    echo 【警告】ping网关超时
    echo 【分析依据】手机热点/很多WiFi会拦截ICMP，ping不通≠网关断；企业内网ping不通才是故障
) else (
    echo 【正常】网关ping连通正常
)
echo.

echo [3] DNS解析测试（223.5.5.5）
echo ----------------------------------------------
nslookup baidu.com 223.5.5.5 >nul
if !errorlevel! neq 0 (
    echo 【故障】DNS解析失败
) else (
    echo 【正常】DNS解析正常
)
echo 【分析依据】使用公共DNS测试域名解析，排除本机DNS配置问题
echo.

echo [4] 公网三层连通测试（223.5.5.5）
echo ----------------------------------------------
ping -n 2 223.5.5.5 >nul
if !errorlevel! neq 0 (
    echo 【警告】公网IP ping超时
    echo 【分析依据】很多运营商、手机热点拦截ICMP，ping不通不代表上网业务异常
) else (
    echo 【正常】公网三层连通正常
)
echo.

echo [5] 网卡状态与协商速率
echo ----------------------------------------------
wmic nic where netenabled=true get name,speed,status
echo 【分析依据】查看网卡是否启用、协商速率，排查网线/端口问题
echo.

echo [6] 路由追踪 tracert -d -h 8 223.5.5.5
echo ----------------------------------------------
tracert -d -h 8 223.5.5.5
echo 【分析依据】tracert星号* = 对端不回复ICMP超时包，热点、家用宽带非常常见，不一定是断网
echo.
echo ==============================================
echo 基础诊断执行完毕
echo ==============================================
pause
cls
goto MENU

:: ====================== 2. IP冲突专项诊断 ======================
:IP_CONFLICT_DIAG
cls
echo ==============================================
echo              【IP冲突专项诊断】
echo 说明：4198日志=权威实锤；ARP探测仅为疑似，热点NAT环境容易误报！
echo ==============================================
echo.
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /r "IPv4.*[0-9]*\.[0-9]*\.[0-9]*\.[0-9]*"') do set LOCAL_IP=%%i
set LOCAL_IP=!LOCAL_IP: =!
echo 本机检测IP：!LOCAL_IP!
echo.

echo [1] 检测 Windows Tcpip EventID 4198（官方冲突日志）
echo ----------------------------------------------
wevtutil qe System /q:"*[System[Provider[@Name='Tcpip'] and EventID=4198]]" /f:text | findstr "." >nul
if !errorlevel! equ 0 (
    echo 【故障实锤】系统日志存在4198，本机收到免费ARP应答，确认IP冲突！
) else (
    echo 【正常】4198冲突日志无记录，Windows没有捕获冲突告警
)
echo 【分析依据】只有收到对端免费ARP应答，系统才会写入4198；无日志不代表绝对无冲突
echo.

echo [2] ARP辅助探测（疑似预警）
echo ----------------------------------------------
echo 正在清空ARP缓存...
arp -d >nul 2>&1
ping -n 1 !LOCAL_IP! >nul 2>&1
arp -a !LOCAL_IP! | findstr /v "!LOCAL_IP!" | findstr "." >nul
if !errorlevel! equ 0 (
    echo 【预警】ARP表发现同IP其他MAC，疑似IP冲突
    echo 【重要提醒】手机热点、USB共享网络下该结果大概率为误报！
) else (
    echo 【正常】ARP探测未发现异常MAC
)
echo 【分析依据】ARP探测只是辅助手段；最终金标准：交换机ARP表，同一IP双MAC=实锤冲突
echo.
echo ==============================================
echo IP冲突专项诊断完毕
echo ==============================================
pause
cls
goto MENU

:: ====================== 3. 网络风暴专项辅助评估 ======================
:STORM_DIAG
cls
echo ==============================================
echo           【网络风暴专项辅助评估】
echo 说明：批处理无法抓包统计广播帧，仅做经验辅助判断，不能确诊风暴
echo ==============================================
echo.
echo 网络风暴典型现象（你自行对照）
echo 1. 同网段大量主机同时卡顿、延迟高、随机丢包
echo 2. 网关ping持续间歇性丢包，时通时断
echo 3. 交换机端口流量占满，指示灯狂闪
echo 4. 内网访问缓慢，外网业务也跟着受影响
echo.
echo 确诊手段：使用Wireshark抓包，查看广播包占比
echo 【分析依据】广播风暴 = 二层广播报文泛滥，耗尽交换机带宽；
echo             常见诱因：网线环路、故障网卡、广播病毒、异常设备
echo.
echo 排查建议：
echo  - 逐步断开交换机端口，定位故障端口
echo  - 交换机查看端口流量、错误包统计
echo ==============================================
echo 网络风暴辅助评估完成
echo ==============================================
pause
cls
goto MENU

:: ====================== 4. 网关ARP / ARP欺骗核查 ======================
:ARP_GW_DIAG
cls
echo ==============================================
echo          【网关ARP、ARP欺骗风险核查】
echo ==============================================
echo.
for /f "tokens=2 delims=:" %%g in ('ipconfig ^| findstr /i "默认网关"') do set GW=%%g
set GW=!GW: =!
echo 网关IP：!GW!
echo.
echo 网关ARP条目：
echo ----------------------------------------------
arp -a !GW!
echo.
echo 【分析依据】
echo 正常：网关MAC固定，和路由器/交换机真实MAC一致，长期不变
echo 风险：网关MAC频繁跳动、出现陌生MAC，高度怀疑ARP欺骗
echo 【重点】需要你手动记录路由器真实MAC，拿来比对！
echo ==============================================
echo ARP欺骗核查完毕
echo ==============================================
pause
cls
goto MENU

:: ====================== 5. 防火墙状态核查 ======================
:FW_DIAG
cls
echo ==============================================
echo          【Windows防火墙状态核查】
echo ==============================================
echo.
netsh advfirewall show allprofiles state
echo.
netsh advfirewall show allprofiles state | findstr "ON" >nul
if !errorlevel! equ 0 (
    echo 【警告】防火墙处于开启状态
    echo 【分析依据】防火墙开启是正常安全策略，可能拦截ICMP ping、部分内网端口访问，不是故障
) else (
    echo 【正常】防火墙全部配置文件处于关闭状态
)
echo ==============================================
echo 防火墙核查完毕
echo ==============================================
pause
cls
goto MENU

:EXIT
endlocal
echo 程序退出
timeout /t 1 >nul
