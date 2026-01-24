= Умное управление вентиляторами для Huananzhi H12D-8D (EPYC SP3 + NVIDIA GPU) =

В этой статье описывается реализация полностью автоматической системы управления охлаждением для сервера на базе материнской платы '''Huananzhi H12D-8D''' (Socket SP3, AMD EPYC).

== 1. Введение: Проблема шума ==
Материнская плата Huananzhi H12D-8D, как и многие серверные платы для EPYC, имеет агрессивные стандартные профили вентиляторов. В сочетании с мощными корпусными вентиляторами и видеокартой NVIDIA (в данном случае RTX 3090), сервер может работать неоправданно громко, даже при низкой нагрузке.

Задача: создать демона по принципу '''"Настроил и забыл"''', который:
* Снижает шум до минимума (Silent/Quiet), когда система простаивает.
* Автоматически повышает обороты конкретных вентиляторов на основе данных с датчиков (CPU, GPU, HDD).
* Управляет '''системными вентиляторами''' через чип Super I/O.
* Управляет '''вентиляторами видеокарты''' напрямую через драйвер NVIDIA (перехватывая управление у BIOS карты).

== 2. Оборудование и сложности ==

=== 2.1 Системные вентиляторы (Super I/O) ===
* '''Чип''': ITE IT8613E
* '''Проблема''': Стандартный драйвер ядра Linux <code>it87</code> не определяет этот чип автоматически. Попытка загрузки выдает "No such device".
* '''Решение''': Использовать модифицированный драйвер (out-of-tree), который поддерживает чипы ITE на платах с конфликтами ресурсов ACPI.

=== 2.2 Вентиляторы GPU (NVIDIA) ===
* '''Оборудование''': NVIDIA RTX 3090
* '''Проблема''': Драйверы NVIDIA на Linux в серверном (headless) режиме не позволяют управлять вентиляторами через <code>nvidia-smi</code>. Для управления через <code>nvidia-settings</code> '''обязательно''' нужен запущенный X Server (графическая оболочка), даже если монитор не подключен.
* '''Решение''': Настроить виртуальный ("заглушку") X Server и включить опцию "Coolbits".

----

== 3. Этап 1: Системные вентиляторы (IT8613E) ==

=== 3.1 Установка драйвера ===
Мы используем форк драйвера от [https://github.com/frankcrawford/it87 Frank Crawford], который корректно обрабатывает конфликты ACPI.

'''Установка зависимостей:'''
<syntaxhighlight lang="bash">
apt update
apt install -y git build-essential dkms pve-headers-$(uname -r)
</syntaxhighlight>

'''Сборка и установка:'''
<syntaxhighlight lang="bash">
git clone https://github.com/frankcrawford/it87.git
cd it87
make
make install
</syntaxhighlight>

=== 3.2 Настройка ===
BIOS материнской платы резервирует ресурсы, блокируя драйвер. Нужно указать ядру относиться к этому мягче.

# Редактируем <code>/etc/default/grub</code>:
#:<syntaxhighlight lang="bash">
GRUB_CMDLINE_LINUX_DEFAULT="quiet acpi_enforce_resources=lax"
</syntaxhighlight>
# Обновляем GRUB и перезагружаемся:
#:<syntaxhighlight lang="bash">
update-grub
reboot
</syntaxhighlight>
# Загружаем модуль с нужным флагом:
#:<syntaxhighlight lang="bash">
modprobe it87 ignore_resource_conflict=1
</syntaxhighlight>
#:''Рекомендуется добавить это в /etc/modules для автозагрузки.''

----

== 4. Этап 2: Управление GPU (Headless) ==

Чтобы разблокировать ручное управление вентиляторами карты, нужно активировать "Coolbits" в Xorg.

=== 4.1 Установка X и утилит ===
<syntaxhighlight lang="bash">
apt install -y xserver-xorg xinit libgtk-3-0
</syntaxhighlight>

=== 4.2 Конфигурация Xorg ===
Создаем конфиг, включающий '''Coolbits=4''' (Fan Control).

'''Файл: /etc/X11/xorg.conf'''
<syntaxhighlight lang="text">
Section "Device"
    Identifier     "Device0"
    Driver         "nvidia"
    VendorName     "NVIDIA Corporation"
    Option         "Coolbits" "4"
    Option         "AllowEmptyInitialConfiguration" "True"
    BusID          "PCI:195:0:0"  # Проверьте ваш BusID через lspci
EndSection

Section "Screen"
    Identifier     "Screen0"
    Device         "Device0"
    DefaultDepth    24
    Option         "AllowEmptyInitialConfiguration" "True"
    SubSection     "Display"
        Depth       24
    EndSubSection
EndSection
</syntaxhighlight>

=== 4.3 Сервис для Headless X ===
X-сервер должен запускаться автоматически в фоне.

'''Файл: /etc/systemd/system/headless-x.service'''
<syntaxhighlight lang="ini">
[Unit]
Description=Headless X Server for NVIDIA GPU Control
After=network.target

[Service]
ExecStart=/usr/bin/X :0 -noreset +extension GLX +extension RANDR +extension RENDER
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
</syntaxhighlight>

----

== 5. Демон управления (Python скрипт) ==

Сердцем системы является Python-скрипт (<code>fan_control.py</code>). Он реализует '''параллельные конечные автоматы (State Machines)''' для независимого управления системными вентиляторами и видеокартой.

=== 5.1 Логика работы ===
* '''Независимость''':
** '''System Fans''': 3 режима (Quiet, Standard, Critical) на основе максимума температур CPU/HDD.
** '''GPU Fans''': 5 режимов (Auto, 45%, 50%, 60%, 100%) на основе температуры GPU.
* '''Гистерезис (Защита от скачков)''':
** '''Мгновенный разгон''': При скачке температуры (выше порога) скорость повышается через 5 секунд.
** '''Задержка замедления''': Если температура упала, система ждет 30-60 секунд перед тем как снизить обороты. Это предотвращает постоянный гул (разгон-торможение).
* '''Двойной режим вывода''':
** '''Интерактивный''': При запуске в консоли показывает живую таблицу-монитор.
** '''Демон''': При запуске через systemd пишет в лог только изменения статуса, чтобы не засорять диск.

=== 5.2 Исходный код ===
'''Файл: /root/monitor/fan_control.py'''

<div class="toccolours mw-collapsible mw-collapsed">
'''Исходный код скрипта (Развернуть)'''
<div class="mw-collapsible-content">
<syntaxhighlight lang="python">
#!/usr/bin/env python3
import os
import sys
# ... (Здесь должен быть полный код скрипта) ...
# Вставьте актуальный код из fan_control.py
</syntaxhighlight>
</div>
</div>

----

== 6. Настройка автозапуска (Systemd) ==

Чтобы скрипт работал 24/7 и переживал перезагрузки, оформляем его как сервис.

=== 6.1 Файл сервиса ===
'''Файл: /etc/systemd/system/fan-control.service'''
<syntaxhighlight lang="ini">
[Unit]
Description=Auto Fan Control Daemon
After=headless-x.service
Requires=headless-x.service

[Service]
Type=simple
ExecStart=/usr/bin/python3 /root/monitor/fan_control.py
WorkingDirectory=/root/monitor
Environment="DISPLAY=:0"
Environment="PYTHONUNBUFFERED=1"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
</syntaxhighlight>

=== 6.2 Активация ===
<syntaxhighlight lang="bash">
systemctl daemon-reload
systemctl enable headless-x.service
systemctl enable fan-control.service
systemctl start fan-control.service
</syntaxhighlight>

=== 6.3 Проверка статуса ===
Посмотреть логи (в режиме демона они компактные):
<syntaxhighlight lang="bash">
journalctl -u fan-control -f
</syntaxhighlight>

Посмотреть "живой" монитор (на время отладки):
<syntaxhighlight lang="bash">
systemctl stop fan-control
python3 /root/monitor/fan_control.py
# (Посмотрели, нажали Ctrl+C)
systemctl start fan-control
</syntaxhighlight>
