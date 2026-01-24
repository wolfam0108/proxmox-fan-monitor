= Умное управление вентиляторами для Huananzhi H12D-8D (EPYC SP3 + NVIDIA GPU) =

В этой статье описывается реализация полностью автоматической системы управления охлаждением для сервера на базе материнской платы '''Huananzhi H12D-8D''' (Socket SP3, AMD EPYC) с веб-интерфейсом для мониторинга и настройки.

== 1. Введение: Проблема шума ==
Материнская плата Huananzhi H12D-8D, как и многие серверные платы для EPYC, имеет агрессивные стандартные профили вентиляторов. В сочетании с мощными корпусными вентиляторами и видеокартой NVIDIA (в данном случае RTX 3090), сервер может работать неоправданно громко, даже при низкой нагрузке.

'''Задача''': создать демона по принципу '''"Настроил и забыл"''', который:
* Снижает шум до минимума (Silent/Quiet), когда система простаивает.
* Автоматически повышает обороты конкретных вентиляторов на основе данных с датчиков (CPU, GPU, HDD).
* Управляет '''системными вентиляторами''' через чип Super I/O.
* Управляет '''вентиляторами видеокарты''' напрямую через драйвер NVIDIA.
* Предоставляет '''веб-интерфейс''' для мониторинга и настройки в реальном времени.

== 2. Возможности системы ==

=== 2.1 Основные функции ===
* '''Многоуровневая логика''' — автоматическое переключение режимов по температуре CPU/GPU/HDD
* '''Гистерезис''' — защита от частых переключений (задержки на повышение и понижение)
* '''Независимое управление''' — системные и GPU вентиляторы управляются отдельными автоматами
* '''Двойной режим''' — интерактивный вывод в консоли и компактные логи в режиме демона

=== 2.2 Веб-интерфейс ===
* '''Панель мониторинга''' — температуры CPU/GPU/HDD, статус вентиляторов в реальном времени
* '''Графики истории''' — визуализация температур и режимов за выбранный период (1м — 1мес)
* '''Ручной режим''' — переключение Auto/Manual и выбор режима через UI
* '''Настройки''' — редактирование порогов температур и целевых оборотов
* '''REST API''' — интеграция с внешними системами

=== 2.3 API endpoints ===
{| class="wikitable"
! Endpoint !! Метод !! Описание
|-
| /api/status || GET || Текущее состояние системы
|-
| /api/history?range=1h || GET || История температур и режимов
|-
| /api/config || GET/POST || Получить/сохранить конфигурацию
|-
| /api/override || POST || Переключить режим (manual/auto)
|-
| /api/restart || POST || Перезапустить демон
|}

----

== 3. Оборудование и сложности ==

=== 3.1 Системные вентиляторы (Super I/O) ===
* '''Чип''': ITE IT8613E
* '''Проблема''': Стандартный драйвер ядра Linux <code>it87</code> не определяет этот чип автоматически. Попытка загрузки выдает "No such device".
* '''Решение''': Использовать модифицированный драйвер (out-of-tree), который поддерживает чипы ITE на платах с конфликтами ресурсов ACPI.

=== 3.2 Вентиляторы GPU (NVIDIA) ===
* '''Оборудование''': NVIDIA RTX 3090
* '''Проблема''': Драйверы NVIDIA на Linux в серверном (headless) режиме не позволяют управлять вентиляторами через <code>nvidia-smi</code>. Для управления через <code>nvidia-settings</code> '''обязательно''' нужен запущенный X Server.
* '''Решение''': Настроить виртуальный ("заглушку") X Server и включить опцию "Coolbits".

----

== 4. Установка ==

=== 4.1 Исходный код ===
Все исходные файлы доступны в репозитории GitHub:

'''Репозиторий: [https://github.com/wolfam0108/proxmox-fan-monitor https://github.com/wolfam0108/proxmox-fan-monitor]'''

<syntaxhighlight lang="bash">
cd /root
git clone https://github.com/wolfam0108/proxmox-fan-monitor.git monitor
cd monitor
</syntaxhighlight>

=== 4.2 Драйвер IT87 ===
Используем форк драйвера от [https://github.com/frankcrawford/it87 Frank Crawford].

'''Установка зависимостей:'''
<syntaxhighlight lang="bash">
apt update
apt install -y git build-essential dkms pve-headers-$(uname -r)
</syntaxhighlight>

'''Сборка и установка:'''
<syntaxhighlight lang="bash">
git clone https://github.com/frankcrawford/it87.git
cd it87
make && make install
</syntaxhighlight>

'''Настройка GRUB:'''
BIOS материнской платы резервирует ресурсы, блокируя драйвер.

<syntaxhighlight lang="bash">
# Редактируем /etc/default/grub:
GRUB_CMDLINE_LINUX_DEFAULT="quiet acpi_enforce_resources=lax"

# Обновляем и перезагружаемся:
update-grub
reboot
</syntaxhighlight>

'''Загрузка модуля:'''
<syntaxhighlight lang="bash">
modprobe it87 ignore_resource_conflict=1
echo "it87" >> /etc/modules
</syntaxhighlight>

----

== 5. Настройка GPU (Headless X) ==

=== 5.1 Установка X и утилит ===
<syntaxhighlight lang="bash">
apt install -y xserver-xorg xinit libgtk-3-0
</syntaxhighlight>

=== 5.2 Конфигурация Xorg ===
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

=== 5.3 Сервис для Headless X ===
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

== 6. Установка веб-интерфейса ==

=== 6.1 Установка Node.js ===
<syntaxhighlight lang="bash">
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
</syntaxhighlight>

=== 6.2 Сборка UI ===
<syntaxhighlight lang="bash">
cd /root/monitor/fancontrol-ui
npm install
npm run build
</syntaxhighlight>

Собранные файлы появятся в <code>fancontrol-ui/dist/</code>. Python-демон автоматически обслуживает их на порту 8080.

----

== 7. Настройка автозапуска ==

=== 7.1 Файл сервиса ===
'''Файл: /etc/systemd/system/fan-control.service'''
<syntaxhighlight lang="ini">
[Unit]
Description=Fan Control Daemon with Web UI
After=network.target headless-x.service
Wants=headless-x.service

[Service]
Type=simple
ExecStart=/usr/bin/python3 /root/monitor/fan_control.py
WorkingDirectory=/root/monitor
Environment="DISPLAY=:0"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
</syntaxhighlight>

=== 7.2 Активация ===
<syntaxhighlight lang="bash">
# Копирование сервисов
cp /root/monitor/fan-control.service /etc/systemd/system/

# Активация
systemctl daemon-reload
systemctl enable headless-x.service
systemctl enable fan-control.service
systemctl start headless-x.service
systemctl start fan-control.service
</syntaxhighlight>

=== 7.3 Доступ к веб-интерфейсу ===
После запуска сервиса откройте в браузере:

'''http://IP_ВАШЕГО_СЕРВЕРА:8080'''

----

== 8. Использование ==

=== 8.1 Вкладка "Панель" ===
* Карточки с температурами CPU, GPU, HDD
* Статус логики управления (режим, цель, статус)
* Кнопка АВТО/РУЧНОЙ для переключения режима
* В ручном режиме — кнопки выбора режима (Р1, Р2, Р3)
* Список вентиляторов с текущими оборотами

=== 8.2 Вкладка "Графики" ===
* Выбор временного диапазона (1м — 1мес)
* График температур CPU/GPU/HDD
* График режимов системы и GPU

=== 8.3 Вкладка "Настройки" ===
* Редактирование целевых оборотов для каждого режима
* Редактирование порогов переключения
* Кнопка "Сохранить" — только запись в конфиг
* Кнопка "Сохранить и применить" — запись + перезапуск демона

=== 8.4 Проверка через консоль ===
<syntaxhighlight lang="bash">
# Логи сервиса
journalctl -u fan-control -f

# Интерактивный режим (для отладки)
systemctl stop fan-control
python3 /root/monitor/fan_control.py
# (Ctrl+C для выхода)
systemctl start fan-control

# API проверка
curl http://localhost:8080/api/status
</syntaxhighlight>

----

== 9. Конфигурация ==

Файл <code>fan_config.json</code> создается автоматически при первом запуске. Можно редактировать вручную или через веб-интерфейс.

<syntaxhighlight lang="json">
{
  "system": {
    "targets": {"1": 1200, "2": 1600, "3": 2000},
    "thresholds": {
      "2": [57, 76, 41],
      "3": [62, 82, 48]
    }
  },
  "gpu": {
    "targets": {"0": 0, "1": 45, "2": 50, "3": 60, "4": 100},
    "thresholds": {
      "1": [999, 60, 999],
      "2": [999, 70, 999],
      "3": [999, 75, 999],
      "4": [999, 82, 999]
    }
  },
  "override": {
    "system": {"enabled": false, "mode": "1"},
    "gpu": {"enabled": false, "mode": "0"}
  }
}
</syntaxhighlight>

'''Пояснения:'''
* <code>targets</code> — целевые обороты (RPM для системы, % для GPU)
* <code>thresholds</code> — пороги [CPU, GPU, HDD] в °C
* <code>override</code> — ручной режим (enabled=true фиксирует режим)

----

== 10. Ссылки ==

* '''Репозиторий проекта:''' [https://github.com/wolfam0108/proxmox-fan-monitor https://github.com/wolfam0108/proxmox-fan-monitor]
* '''Драйвер IT87:''' [https://github.com/frankcrawford/it87 https://github.com/frankcrawford/it87]
* '''NVIDIA Coolbits:''' [https://wiki.archlinux.org/title/NVIDIA/Tips_and_tricks#Enabling_overclocking ArchWiki - NVIDIA Coolbits]

[[Category:Proxmox]]
[[Category:Охлаждение]]
[[Category:Серверы]]
