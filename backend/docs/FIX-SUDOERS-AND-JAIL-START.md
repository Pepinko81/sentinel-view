# Fix Sudoers and Jail Start Issues

## Проблеми

1. **Restart fail2ban timeout** - Командата `systemctl restart fail2ban` не е в sudoers
2. **Jail start fails** - Jail-ът не може да се стартира с грешка `ERROR NOK`

## Решение

### Стъпка 1: Обновяване на sudoers конфигурацията

Трябва да добавите следните команди в sudoers файла:

```bash
# Изпълнете като root:
sudo /home/pepinko/sentinel-view/backend/scripts/update-sudoers.sh
```

Или ръчно редактирайте `/etc/sudoers.d/sentinel-backend`:

```bash
sudo visudo -f /etc/sudoers.d/sentinel-backend
```

Добавете следните редове:

```bash
# Cmnd_Alias for fail2ban-client (jail control operations)
Cmnd_Alias SENTINEL_FAIL2BAN_CONTROL = \
    /usr/bin/fail2ban-client start *, \
    /usr/bin/fail2ban-client stop *

# Cmnd_Alias for systemctl (fail2ban service control)
Cmnd_Alias SENTINEL_SYSTEMCTL = \
    /usr/bin/systemctl restart fail2ban, \
    /usr/bin/systemctl is-active fail2ban
```

И обновете реда за sentinel_user:

```bash
sentinel_user ALL=(root) NOPASSWD: SENTINEL_SCRIPTS, SENTINEL_FAIL2BAN_READ, SENTINEL_FAIL2BAN_CONTROL, SENTINEL_REGEX, SENTINEL_SYSTEMCTL
```

### Стъпка 2: Проверка на конфигурацията

Проверете синтаксиса:

```bash
sudo visudo -c
```

Проверете правата на потребителя:

```bash
sudo -u sentinel_user sudo -l
```

Трябва да видите:
- `/usr/bin/fail2ban-client start *`
- `/usr/bin/fail2ban-client stop *`
- `/usr/bin/systemctl restart fail2ban`
- `/usr/bin/systemctl is-active fail2ban`

### Стъпка 3: Диагностика на проблем с jail start

Ако jail-ът не може да се стартира, използвайте диагностичния скрипт:

```bash
sudo /home/pepinko/sentinel-view/backend/scripts/diagnose-jail.sh nginx-webdav-attacks
```

Скриптът ще провери:
1. Дали jail-ът е конфигуриран
2. Дали filter файлът съществува
3. Дали action файлът съществува
4. Статуса на fail2ban услугата
5. Грешки в логовете
6. Опит за стартиране и показване на грешката

### Стъпка 4: Често срещани проблеми и решения

#### Проблем: Jail не може да се стартира с ERROR NOK

**Причини:**
1. Filter файлът не съществува (най-често)
2. Action файлът не съществува
3. Невалидна конфигурация в jail файла
4. Проблем с log файла или пътя

**Автоматично решение (препоръчително):**

Backend-ът автоматично проверява и създава filter файлове при опит за enable на jail. Ако filter файлът липсва и има наличен шаблон, той се създава автоматично.

**Поддържани автоматични filter шаблони:**
- `nginx-webdav-attacks` - WebDAV атаки (PROPFIND, OPTIONS, MKCOL, PUT, DELETE, и т.н.)
- `nginx-hidden-files` - Опити за достъп до скрити файлове (.env, .git, .aws, и т.н.)
- `nginx-admin-scanners` - Сканиране на admin панели
- `nginx-robots-scan` - Прекомерни заявки към robots.txt
- `nginx-404` - Прекомерни 404 грешки
- `nginx-error-cycle` - Rewrite цикъл грешки

**Ръчно решение (ако автоматичното не работи):**

1. Проверете конфигурацията на jail-а:
```bash
sudo grep -A 20 "\[nginx-webdav-attacks\]" /etc/fail2ban/jail.d/*.conf /etc/fail2ban/jail.local
```

2. Проверете дали filter файлът съществува:
```bash
ls -la /etc/fail2ban/filter.d/nginx-webdav-attacks.conf
```

3. **Ако filter файлът не съществува**, създайте го:
```bash
# Автоматично създаване:
sudo /home/pepinko/sentinel-view/backend/scripts/create-webdav-filter.sh

# Или ръчно създайте файла:
sudo nano /etc/fail2ban/filter.d/nginx-webdav-attacks.conf
```

4. Проверете fail2ban логовете:
```bash
sudo tail -50 /var/log/fail2ban.log | grep -i "nginx-webdav-attacks"
```

5. Тествайте filter-а (след като е създаден):
```bash
sudo fail2ban-regex /var/log/nginx/access.log /etc/fail2ban/filter.d/nginx-webdav-attacks.conf
```

6. Рестартирайте fail2ban услугата:
```bash
sudo systemctl restart fail2ban
```

7. Стартирайте jail-а (от UI или команда):
```bash
sudo fail2ban-client start nginx-webdav-attacks
```

8. Проверете статуса:
```bash
sudo fail2ban-client status nginx-webdav-attacks
```

#### Проблем: Restart timeout

**Причина:** Командата `systemctl restart fail2ban` не е в sudoers

**Решение:** Следвайте Стъпка 1 по-горе

#### Проблем: Permission denied при start/stop

**Причина:** Командите `fail2ban-client start/stop` не са в sudoers

**Решение:** Следвайте Стъпка 1 по-горе

### Стъпка 5: Тестване след обновяване

След като обновите sudoers, тествайте:

```bash
# Тест start jail
sudo -u sentinel_user sudo /usr/bin/fail2ban-client start nginx-webdav-attacks

# Тест stop jail
sudo -u sentinel_user sudo /usr/bin/fail2ban-client stop nginx-webdav-attacks

# Тест restart fail2ban
sudo -u sentinel_user sudo /usr/bin/systemctl restart fail2ban

# Проверка на статус
sudo -u sentinel_user sudo /usr/bin/systemctl is-active fail2ban
```

## Пълна конфигурация на sudoers

Пълният файл `/etc/sudoers.d/sentinel-backend` трябва да изглежда така:

```bash
# ============================================
# Sentinel Backend - Hardened Sudoers Config
# ============================================

Cmnd_Alias SENTINEL_SCRIPTS = \
    /opt/fail2ban-dashboard/scripts/monitor-security.sh, \
    /opt/fail2ban-dashboard/scripts/quick-check.sh, \
    /opt/fail2ban-dashboard/scripts/backup-fail2ban.sh, \
    /opt/fail2ban-dashboard/scripts/test-fail2ban.sh, \
    /opt/fail2ban-dashboard/scripts/test-filters.sh

Cmnd_Alias SENTINEL_FAIL2BAN_READ = \
    /usr/bin/fail2ban-client status, \
    /usr/bin/fail2ban-client status *

Cmnd_Alias SENTINEL_FAIL2BAN_CONTROL = \
    /usr/bin/fail2ban-client start *, \
    /usr/bin/fail2ban-client stop *

Cmnd_Alias SENTINEL_REGEX = \
    /usr/bin/fail2ban-regex

Cmnd_Alias SENTINEL_SYSTEMCTL = \
    /usr/bin/systemctl restart fail2ban, \
    /usr/bin/systemctl is-active fail2ban

# Cmnd_Alias for filter file management
# Allows creating filter files automatically when enabling jails
Cmnd_Alias SENTINEL_FILTER_MGMT = \
    /home/pepinko/sentinel-view/backend/scripts/create-filter-file.sh

sentinel_user ALL=(root) NOPASSWD: SENTINEL_SCRIPTS, SENTINEL_FAIL2BAN_READ, SENTINEL_FAIL2BAN_CONTROL, SENTINEL_REGEX, SENTINEL_SYSTEMCTL, SENTINEL_FILTER_MGMT
```

## Бележки

- Винаги използвайте `visudo` за редактиране на sudoers файлове
- Проверявайте синтаксиса с `visudo -c` преди да запазите промените
- Правете backup на съществуващия файл преди промени
- Скриптът `update-sudoers.sh` автоматично прави backup

