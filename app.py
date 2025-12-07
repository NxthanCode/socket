from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_from_directory
from flask_session import Session
from flask_socketio import SocketIO, emit, join_room, leave_room
import sqlite3
import hashlib
import os
import uuid
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
import random
import json
import time

app = Flask(__name__)
app.secret_key = 'your_secret_key_here_change_in_production'
app.config['SESSION_TYPE'] = 'filesystem'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif'}
Session(app)

socketio = SocketIO(app, cors_allowed_origins="*", manage_session=False, async_mode="threading")

online_users = {}
spectators = {}
active_games = {}

def init_db():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'offline',
        last_claim DATE,
        streak INTEGER DEFAULT 0
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        bio TEXT,
        avatar TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_read INTEGER DEFAULT 0,
        FOREIGN KEY (sender_id) REFERENCES users (id),
        FOREIGN KEY (receiver_id) REFERENCES users (id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS money (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        balance INTEGER DEFAULT 1000,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS mines_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        grid_size INTEGER DEFAULT 5,
        mines_count INTEGER DEFAULT 5,
        revealed_cells TEXT DEFAULT '',
        mines_positions TEXT DEFAULT '',
        game_state TEXT DEFAULT 'playing',
        bet_amount INTEGER DEFAULT 0,
        potential_win INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS spectators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host_id INTEGER NOT NULL,
        spectator_id INTEGER NOT NULL,
        game_type TEXT NOT NULL,
        game_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (host_id) REFERENCES users (id),
        FOREIGN KEY (spectator_id) REFERENCES users (id)
    )
    ''')
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS slots_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        slot_type TEXT DEFAULT '5x3',
        bet_amount INTEGER DEFAULT 10,
        current_bet INTEGER DEFAULT 10,
        last_win INTEGER DEFAULT 0,
        total_spins INTEGER DEFAULT 0,
        game_state TEXT DEFAULT 'playing',
        game_id TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_spin_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS shop_boosters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        game TEXT NOT NULL,
        type TEXT NOT NULL,
        price INTEGER NOT NULL,
        duration INTEGER,
        effect_value REAL,
        rarity TEXT DEFAULT 'common',
        featured INTEGER DEFAULT 0
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS shop_packs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        contents TEXT NOT NULL,
        rarity TEXT DEFAULT 'common',
        color TEXT
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS shop_special_offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        original_price INTEGER NOT NULL,
        items TEXT NOT NULL,
        expires_at TIMESTAMP,
        icon TEXT
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS user_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        game TEXT,
        quantity INTEGER DEFAULT 0,
        expires_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS active_boosters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        game TEXT NOT NULL,
        booster_type TEXT NOT NULL,
        booster_id INTEGER NOT NULL,
        active_until TIMESTAMP,
        uses_remaining INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS pvp_lobbies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host_id INTEGER NOT NULL,
        guest_id INTEGER,
        bet_amount INTEGER NOT NULL,
        grid_size INTEGER DEFAULT 5,
        mines_count INTEGER DEFAULT 5,
        status TEXT DEFAULT 'waiting',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (host_id) REFERENCES users (id),
        FOREIGN KEY (guest_id) REFERENCES users (id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS pvp_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lobby_id INTEGER NOT NULL,
        player1_id INTEGER NOT NULL,
        player2_id INTEGER NOT NULL,
        current_turn INTEGER NOT NULL,
        player1_revealed TEXT DEFAULT '',
        player2_revealed TEXT DEFAULT '',
        player1_score INTEGER DEFAULT 0,
        player2_score INTEGER DEFAULT 0,
        mines_positions TEXT DEFAULT '',
        game_state TEXT DEFAULT 'playing',
        winner_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lobby_id) REFERENCES pvp_lobbies (id),
        FOREIGN KEY (player1_id) REFERENCES users (id),
        FOREIGN KEY (player2_id) REFERENCES users (id),
        FOREIGN KEY (winner_id) REFERENCES users (id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS pvp_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user_id INTEGER NOT NULL,
        to_user_id INTEGER NOT NULL,
        bet_amount INTEGER NOT NULL,
        grid_size INTEGER DEFAULT 5,
        mines_count INTEGER DEFAULT 5,
        status TEXT DEFAULT 'pending',
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_user_id) REFERENCES users (id),
        FOREIGN KEY (to_user_id) REFERENCES users (id)
    )
    ''')

    conn.commit()
    conn.close()

def populate_shop_data():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if boosters already exist
    existing = cursor.execute('SELECT COUNT(*) FROM shop_boosters').fetchone()[0]
    if existing == 0:
        # Mines Boosters
        mines_boosters = [
            ('Mine Sniffer Dog', 'Reduces mines by 1 in your next game', 'mines', 'mine_sniffer', 100, 1, 0, 'rare', 1),
            ('Kevlar Vest', 'Protects you from 1 mine explosion', 'mines', 'kevlar_vest', 250, 1, 0, 'epic', 1),
            ('Gold Pickaxe', 'Increases rewards by 50%', 'mines', 'gold_pickaxe', 500, 1, 1.5, 'legendary', 0),
            ('Metal Detector', 'Reveals safe spots around mines', 'mines', 'metal_detector', 150, 1, 0, 'rare', 0),
            ('X-Ray Scanner', 'Temporarily reveals 1 random mine', 'mines', 'x_ray', 300, 1, 0, 'epic', 0)
        ]
        
        # Crash Boosters
        crash_boosters = [
            ('Auto-Lock Robot', 'Automatically cash out at set multiplier', 'crash', 'robot', 200, 3, 0, 'rare', 0),
            ('Stabilizer', 'Reduces crash probability by 30%', 'crash', 'stabilizer', 350, 1, 0.7, 'epic', 1),
            ('Rocket Boost', 'Increases multiplier growth speed', 'crash', 'rocket', 450, 1, 1.3, 'legendary', 0)
        ]
        
        # Slots Boosters
        slots_boosters = [
            ('Lucky Charm', 'Increases chance of winning combinations', 'slots', 'lucky_charm', 150, 5, 0.2, 'common', 0),
            ('Double Rewards', 'Doubles all wins for 5 spins', 'slots', 'double_rewards', 400, 5, 2.0, 'epic', 1),
            ('Extra Life', 'Get one extra spin for free', 'slots', 'extra_life', 100, 1, 0, 'common', 0),
            ('Wild Symbol', 'Adds wild symbols to reels', 'slots', 'wild_symbol', 300, 3, 0, 'rare', 0),
            ('Jackpot Boost', 'Increases jackpot chance by 25%', 'slots', 'jackpot_boost', 600, 1, 1.25, 'legendary', 0)
        ]
        
        all_boosters = mines_boosters + crash_boosters + slots_boosters
        
        for booster in all_boosters:
            cursor.execute('''
                INSERT INTO shop_boosters (name, description, game, type, price, duration, effect_value, rarity, featured)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', booster)
        
        # Packs
        packs = [
            ('Starter Pack', 'Perfect for beginners', 1000, 'mine_sniffer:2,kevlar_vest:1,lucky_charm:3', 'common', 'linear-gradient(135deg, #4cc9f0, #4361ee)'),
            ('Pro Gambler Pack', 'For serious players', 2500, 'gold_pickaxe:1,stabilizer:1,double_rewards:2', 'epic', 'linear-gradient(135deg, #ffd700, #ffa500)'),
            ('Legendary Bundle', 'The ultimate collection', 5000, 'x_ray:2,rocket:1,jackpot_boost:1,wild_symbol:3', 'legendary', 'linear-gradient(135deg, #f72585, #7209b7)'),
            ('Mines Master Pack', 'Dominate the mines', 2000, 'mine_sniffer:3,metal_detector:2,kevlar_vest:2', 'rare', 'linear-gradient(135deg, #38b000, #2d9100)'),
            ('Crash Expert Pack', 'Master the crash game', 2000, 'robot:2,stabilizer:1,rocket:1', 'rare', 'linear-gradient(135deg, #00b4d8, #0096c7)'),
            ('Slots King Pack', 'Rule the slots', 2000, 'lucky_charm:5,wild_symbol:2,extra_life:3', 'rare', 'linear-gradient(135deg, #9d4edd, #7b2cbf)'),
            ('Lucky Day Pack', 'Boost your luck', 1500, 'lucky_charm:5,extra_life:5', 'common', 'linear-gradient(135deg, #ff6b6b, #ff8e53)'),
            ('High Roller Pack', 'For the big spenders', 10000, 'gold_pickaxe:2,jackpot_boost:2,rocket:2,double_rewards:5', 'legendary', 'linear-gradient(135deg, #ff0000, #ff9100)')
        ]
        
        for pack in packs:
            cursor.execute('''
                INSERT INTO shop_packs (name, description, price, contents, rarity, color)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', pack)
        
        # Special Offers (expire in 7 days)
        from datetime import datetime, timedelta
        expires = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')
        
        special_offers = [
            ('Ultimate Weekend Bundle', 'Limited time weekend offer!', 7500, 12000, 'gold_pickaxe:1,rocket:1,jackpot_boost:1,x_ray:2,stabilizer:1', expires, 'fas fa-fire'),
            ('New Player Welcome Pack', 'Special offer for new players', 500, 1500, 'mine_sniffer:2,lucky_charm:3,extra_life:5', expires, 'fas fa-gift'),
            ('Daily Booster Bundle', 'Get your daily boosters', 1000, 2000, 'lucky_charm:5,extra_life:5,mine_sniffer:1', expires, 'fas fa-bolt')
        ]
        
        for offer in special_offers:
            cursor.execute('''
                INSERT INTO shop_special_offers (name, description, price, original_price, items, expires_at, icon)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', offer)
    
    conn.commit()
    conn.close()

def get_db_connection():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

@app.before_request
def make_session_permanent():
    session.permanent = True

@app.route('/')
def index():
    return render_template('index.html')



@app.route('/shop')
def shop_page():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('shop.html')

@app.route('/api/inventory')
def get_inventory():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    inventory = conn.execute('''
        SELECT ui.*, sb.name, sb.game, sb.type
        FROM user_inventory ui
        LEFT JOIN shop_boosters sb ON ui.item_id = sb.id
        WHERE ui.user_id = ? AND ui.quantity > 0
        ORDER BY sb.game, sb.type
    ''', (session['user_id'],)).fetchall()
    
    inventory_list = []
    for item in inventory:
        inventory_list.append({
            'id': item['id'],
            'item_id': item['item_id'],
            'type': item['type'],
            'game': item['game'],
            'name': item['name'],
            'quantity': item['quantity'],
            'expires_at': item['expires_at']
        })
    
    conn.close()
    return jsonify(inventory_list)

@app.route('/api/shop/boosters')
def get_boosters():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    boosters = conn.execute('SELECT * FROM shop_boosters ORDER BY featured DESC, price ASC').fetchall()
    
    boosters_list = []
    for booster in boosters:
        boosters_list.append({
            'id': booster['id'],
            'name': booster['name'],
            'description': booster['description'],
            'game': booster['game'],
            'type': booster['type'],
            'price': booster['price'],
            'duration': booster['duration'],
            'effect_value': booster['effect_value'],
            'rarity': booster['rarity'],
            'featured': bool(booster['featured'])
        })
    
    conn.close()
    return jsonify(boosters_list)

@app.route('/api/shop/packs')
def get_packs():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    packs = conn.execute('SELECT * FROM shop_packs ORDER BY rarity, price').fetchall()
    
    packs_list = []
    for pack in packs:
        packs_list.append({
            'id': pack['id'],
            'name': pack['name'],
            'description': pack['description'],
            'price': pack['price'],
            'contents': pack['contents'],
            'rarity': pack['rarity'],
            'color': pack['color']
        })
    
    conn.close()
    return jsonify(packs_list)

@app.route('/api/shop/special')
def get_special_offers():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    offers = conn.execute('''
        SELECT * FROM shop_special_offers 
        WHERE expires_at > datetime('now')
        ORDER BY price ASC
    ''').fetchall()
    
    offers_list = []
    for offer in offers:
        offers_list.append({
            'id': offer['id'],
            'name': offer['name'],
            'description': offer['description'],
            'price': offer['price'],
            'original_price': offer['original_price'],
            'items': json.loads(offer['items']) if offer['items'].startswith('[') else offer['items'].split(','),
            'expires_at': offer['expires_at'],
            'icon': offer['icon']
        })
    
    conn.close()
    return jsonify(offers_list)

@app.route('/api/shop/buy-booster', methods=['POST'])
def buy_booster():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    booster_id = data.get('booster_id')
    quantity = data.get('quantity', 1)
    
    conn = get_db_connection()
    
    # Get booster info
    booster = conn.execute('SELECT * FROM shop_boosters WHERE id = ?', (booster_id,)).fetchone()
    if not booster:
        conn.close()
        return jsonify({'success': False, 'message': 'Booster not found'})
    
    total_price = booster['price'] * quantity
    
    # Check balance
    money = conn.execute('SELECT balance FROM money WHERE user_id = ?', (session['user_id'],)).fetchone()
    if not money or money['balance'] < total_price:
        conn.close()
        return jsonify({'success': False, 'message': 'Insufficient balance'})
    
    # Deduct money
    cursor = conn.cursor()
    cursor.execute('UPDATE money SET balance = balance - ? WHERE user_id = ?', (total_price, session['user_id']))
    
    # Add to inventory
    existing_item = conn.execute('''
        SELECT * FROM user_inventory 
        WHERE user_id = ? AND item_id = ? AND item_type = ?
    ''', (session['user_id'], booster_id, 'booster')).fetchone()
    
    if existing_item:
        cursor.execute('''
            UPDATE user_inventory 
            SET quantity = quantity + ?
            WHERE id = ?
        ''', (quantity, existing_item['id']))
    else:
        cursor.execute('''
            INSERT INTO user_inventory (user_id, item_type, item_id, game, quantity)
            VALUES (?, 'booster', ?, ?, ?)
        ''', (session['user_id'], booster_id, booster['game'], quantity))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'booster_name': booster['name'],
        'quantity': quantity,
        'total_price': total_price,
        'new_balance': money['balance'] - total_price
    })

@app.route('/api/shop/buy-pack', methods=['POST'])
def buy_pack():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    pack_id = data.get('pack_id')
    price = data.get('price', 500)
    
    conn = get_db_connection()
    
    # Get pack info
    pack = conn.execute('SELECT * FROM shop_packs WHERE id = ?', (pack_id,)).fetchone()
    if not pack:
        conn.close()
        return jsonify({'success': False, 'message': 'Pack not found'})
    
    # Check balance
    money = conn.execute('SELECT balance FROM money WHERE user_id = ?', (session['user_id'],)).fetchone()
    if not money or money['balance'] < price:
        conn.close()
        return jsonify({'success': False, 'message': 'Insufficient balance'})
    
    # Deduct money
    cursor = conn.cursor()
    cursor.execute('UPDATE money SET balance = balance - ? WHERE user_id = ?', (price, session['user_id']))
    
    # Parse pack contents and add to inventory
    contents = pack['contents'].split(',')
    for content in contents:
        if ':' in content:
            booster_name, quantity = content.split(':')
            booster = conn.execute('SELECT * FROM shop_boosters WHERE name LIKE ?', (f'%{booster_name}%',)).fetchone()
            if booster:
                existing_item = conn.execute('''
                    SELECT * FROM user_inventory 
                    WHERE user_id = ? AND item_id = ? AND item_type = ?
                ''', (session['user_id'], booster['id'], 'booster')).fetchone()
                
                if existing_item:
                    cursor.execute('''
                        UPDATE user_inventory 
                        SET quantity = quantity + ?
                        WHERE id = ?
                    ''', (int(quantity), existing_item['id']))
                else:
                    cursor.execute('''
                        INSERT INTO user_inventory (user_id, item_type, item_id, game, quantity)
                        VALUES (?, 'booster', ?, ?, ?)
                    ''', (session['user_id'], booster['id'], booster['game'], int(quantity)))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'pack_name': pack['name'],
        'price': price,
        'new_balance': money['balance'] - price
    })

@app.route('/api/inventory/use', methods=['POST'])
def use_booster():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    item_id = data.get('item_id')
    
    conn = get_db_connection()
    
    # Get item info
    item = conn.execute('''
        SELECT ui.*, sb.name, sb.game, sb.type 
        FROM user_inventory ui
        LEFT JOIN shop_boosters sb ON ui.item_id = sb.id
        WHERE ui.id = ? AND ui.user_id = ?
    ''', (item_id, session['user_id'])).fetchone()
    
    if not item or item['quantity'] <= 0:
        conn.close()
        return jsonify({'success': False, 'message': 'Item not found or out of stock'})
    
    # Reduce quantity
    cursor = conn.cursor()
    if item['quantity'] == 1:
        cursor.execute('DELETE FROM user_inventory WHERE id = ?', (item_id,))
    else:
        cursor.execute('UPDATE user_inventory SET quantity = quantity - 1 WHERE id = ?', (item_id,))
    
    # Add to active boosters
    from datetime import datetime, timedelta
    active_until = datetime.now() + timedelta(hours=24)  # Active for 24 hours
    
    cursor.execute('''
        INSERT INTO active_boosters (user_id, game, booster_type, booster_id, active_until, uses_remaining)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (session['user_id'], item['game'], item['type'], item['item_id'], active_until, 1))
    
    # Store in session for immediate use
    if 'active_boosters' not in session:
        session['active_boosters'] = {}
    
    if item['game'] not in session['active_boosters']:
        session['active_boosters'][item['game']] = []
    
    session['active_boosters'][item['game']].append(item['type'])
    session.modified = True
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'item_name': item['name'],
        'game': item['game']
    })

@app.route('/api/check-auth')
def check_auth():
    if 'user_id' in session:
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
        profile = conn.execute('SELECT * FROM profiles WHERE user_id = ?', (session['user_id'],)).fetchone()
        money = conn.execute('SELECT balance FROM money WHERE user_id = ?', (session['user_id'],)).fetchone()
        conn.close()

        if user:
            return jsonify({
                'authenticated': True,
                'username': user['username'],
                'user_id': user['id'],
                'balance': money['balance'] if money else 1000,
                'profile': {
                    'bio': profile['bio'] if profile else '',
                    'avatar': profile['avatar'] if profile else '/static/default-avatar.png'
                } if profile else None
            })

    return jsonify({'authenticated': False})

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        conn.close()

        if user and user['password_hash'] == hash_password(password):
            session['user_id'] = user['id']
            session['username'] = user['username']

            conn = get_db_connection()
            conn.execute('UPDATE users SET last_seen = ?, status = ? WHERE id = ?', 
                        (datetime.now(), 'online', user['id']))
            conn.commit()
            conn.close()

            return jsonify({'success': True, 'message': 'login successful'})
        else:
            return jsonify({'success': False, 'message': 'invalid'})

    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        conn = get_db_connection()

        existing_user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        if existing_user:
            conn.close()
            return jsonify({'success': False, 'message': 'username taken'})

        password_hash = hash_password(password)
        cursor = conn.cursor()
        cursor.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', (username, password_hash))
        user_id = cursor.lastrowid

        cursor.execute('INSERT INTO profiles (user_id, bio, avatar) VALUES (?, ?, ?)',
                      (user_id, '', '/static/default-avatar.png'))

        cursor.execute('INSERT INTO money (user_id, balance) VALUES (?, ?)', (user_id, 1000))

        conn.commit()
        conn.close()

        session['user_id'] = user_id
        session['username'] = username

        return jsonify({'success': True, 'message': 'registration successful'})

    return render_template('register.html')

@app.route('/profile', methods=['GET', 'POST'])
def profile():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    if request.method == 'POST':
        bio = request.form.get('bio')
        avatar_url = request.form.get('avatar')

        conn = get_db_connection()

        if 'avatar' in request.files:
            file = request.files['avatar']
            if file and file.filename != '' and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                unique_filename = f"{uuid.uuid4().hex}_{filename}"
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
                file.save(filepath)
                avatar_url = f"/static/uploads/{unique_filename}"

        conn.execute('''
            UPDATE profiles 
            SET bio = ?, avatar = ?
            WHERE user_id = ?
        ''', (bio, avatar_url, session['user_id']))
        conn.commit()
        conn.close()

        return jsonify({'success': True, 'message': 'profile updated'})

    return render_template('profile.html')

@app.route('/players')
def players():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('players.html')

@app.route('/messages')
def messages():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('messages.html')

@app.route('/games')
def games():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('games.html')

@app.route('/leaderboard')
def leaderboard_page():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('leaderboard.html')

@app.route('/api/profile')
def get_profile():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401

    conn = get_db_connection()
    profile = conn.execute('SELECT * FROM profiles WHERE user_id = ?', (session['user_id'],)).fetchone()
    conn.close()

    if profile:
        return jsonify(dict(profile))
    return jsonify({'error': 'profile not found'}), 404

@app.route('/api/players')
def get_players():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401

    conn = get_db_connection()
    users = conn.execute('''
        SELECT u.id, u.username, u.status, u.last_seen, p.avatar, m.balance 
        FROM users u 
        LEFT JOIN profiles p ON u.id = p.user_id 
        LEFT JOIN money m ON u.id = m.user_id
        WHERE u.id != ?
        ORDER BY u.status DESC, u.username
    ''', (session['user_id'],)).fetchall()

    players_list = []
    for user in users:
        players_list.append({
            'id': user['id'],
            'username': user['username'],
            'status': user['status'],
            'last_seen': user['last_seen'],
            'avatar': user['avatar'] if user['avatar'] else '/static/default-avatar.png',
            'balance': user['balance'] if user['balance'] else 1000
        })

    conn.close()
    return jsonify(players_list)

@app.route('/api/user/<int:user_id>')
def get_user(user_id):
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401

    conn = get_db_connection()
    user = conn.execute('''
        SELECT u.id, u.username, u.status, u.last_seen, p.bio, p.avatar, m.balance 
        FROM users u 
        LEFT JOIN profiles p ON u.id = p.user_id 
        LEFT JOIN money m ON u.id = m.user_id
        WHERE u.id = ?
    ''', (user_id,)).fetchone()

    if user:
        result = {
            'id': user['id'],
            'username': user['username'],
            'status': user['status'],
            'last_seen': user['last_seen'],
            'bio': user['bio'],
            'avatar': user['avatar'] if user['avatar'] else '/static/default-avatar.png',
            'balance': user['balance'] if user['balance'] else 1000
        }
        conn.close()
        return jsonify(result)

    conn.close()
    return jsonify({'error': 'User not found'}), 404

@app.route('/api/messages')
def get_messages():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401

    other_user_id = request.args.get('user_id')
    if not other_user_id:
        return jsonify({'error': 'user id required'}), 400

    conn = get_db_connection()
    messages = conn.execute('''
        SELECT m.*, u.username as sender_name, p.avatar as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN profiles p ON m.sender_id = p.user_id
        WHERE (m.sender_id = ? AND m.receiver_id = ?) 
           OR (m.sender_id = ? AND m.receiver_id = ?)
        ORDER BY m.timestamp ASC
    ''', (session['user_id'], other_user_id, other_user_id, session['user_id'])).fetchall()

    messages_list = []
    for msg in messages:
        messages_list.append({
            'id': msg['id'],
            'sender_id': msg['sender_id'],
            'receiver_id': msg['receiver_id'],
            'message': msg['message'],
            'timestamp': msg['timestamp'],
            'is_read': bool(msg['is_read']),
            'sender_name': msg['sender_name'],
            'sender_avatar': msg['sender_avatar'] if msg['sender_avatar'] else '/static/default-avatar.png',
            'is_own': msg['sender_id'] == session['user_id']
        })

    conn.execute('UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND is_read = 0', 
                (session['user_id'], other_user_id))
    conn.commit()
    conn.close()

    return jsonify(messages_list)

@app.route('/api/conversations')
def get_conversations():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401

    conn = get_db_connection()

    conversations = conn.execute('''
        SELECT DISTINCT
            u.id as user_id,
            u.username,
            p.avatar,
            (SELECT MAX(timestamp) FROM messages 
             WHERE (sender_id = ? AND receiver_id = u.id) 
                OR (receiver_id = ? AND sender_id = u.id)) as last_message_time,
            (SELECT message FROM messages 
             WHERE ((sender_id = ? AND receiver_id = u.id) 
                OR (receiver_id = ? AND sender_id = u.id))
             ORDER BY timestamp DESC LIMIT 1) as last_message,
            (SELECT COUNT(*) FROM messages 
             WHERE receiver_id = ? AND sender_id = u.id AND is_read = 0) as unread_count
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        WHERE u.id != ? AND u.id IN (
            SELECT DISTINCT sender_id FROM messages WHERE receiver_id = ?
            UNION
            SELECT DISTINCT receiver_id FROM messages WHERE sender_id = ?
        )
        ORDER BY last_message_time DESC NULLS LAST
    ''', (session['user_id'], session['user_id'], session['user_id'], session['user_id'], 
          session['user_id'], session['user_id'], session['user_id'], session['user_id'])).fetchall()

    conversations_list = []
    for conv in conversations:
        conversations_list.append({
            'user_id': conv['user_id'],
            'username': conv['username'],
            'avatar': conv['avatar'] if conv['avatar'] else '/static/default-avatar.png',
            'last_message': conv['last_message'],
            'last_message_time': conv['last_message_time'],
            'unread_count': conv['unread_count'] or 0
        })

    conn.close()
    return jsonify(conversations_list)


def cleanup_finished_games():
    to_remove = []
    current_time = time.time()
    
    for game_key, game_data in active_games.items():
        if game_data['game_state'] in ['lost', 'cashed_out', 'crashed']:
            if 'finish_time' in game_data:
                if current_time - game_data['finish_time'] > 60:
                    to_remove.append(game_key)
            else:
                game_data['finish_time'] = current_time
        elif game_data['game_type'] == 'crash':
            if 'last_update' in game_data and current_time - game_data['last_update'] > 300:  
                to_remove.append(game_key)
    
    for game_key in to_remove:
        if game_key in active_games:
            del active_games[game_key]

@app.route('/logout')
def logout():
    if 'user_id' in session:
        user_id = session['user_id']
        conn = get_db_connection()
        conn.execute('UPDATE users SET status = ?, last_seen = ? WHERE id = ?', 
                    ('offline', datetime.now(), user_id))
        conn.commit()
        conn.close()

        if user_id in online_users:
            del online_users[user_id]
        
        if user_id in spectators:
            del spectators[user_id]
        
        # Remove all games hosted by this user
        games_to_remove = []
        for game_key, game_data in active_games.items():
            if game_data['host_id'] == user_id:
                games_to_remove.append(game_key)
        
        for game_key in games_to_remove:
            del active_games[game_key]
        
        # Broadcast that this user went offline (no broadcast parameter)
        socketio.emit('user_went_offline', {
            'user_id': user_id,
            'game_keys': games_to_remove
        })

    session.clear()
    return redirect(url_for('index'))

@app.route('/api/money')
def get_money():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401

    conn = get_db_connection()
    money = conn.execute('SELECT balance FROM money WHERE user_id = ?', (session['user_id'],)).fetchone()
    conn.close()

    if money:
        return jsonify({'balance': money['balance']})
    return jsonify({'balance': 1000})


@app.route('/api/mines/start', methods=['POST'])
def mines_start_with_boosters():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    bet_amount = data.get('bet_amount', 10)
    grid_size = data.get('grid_size', 5)
    mines_count = data.get('mines_count', 5)
    boosters = data.get('boosters', [])
    
    conn = get_db_connection()
    
    # Check active boosters from database
    active_db_boosters = conn.execute('''
        SELECT sb.type FROM active_boosters ab
        JOIN shop_boosters sb ON ab.booster_id = sb.id
        WHERE ab.user_id = ? AND ab.game = 'mines' 
        AND ab.active_until > datetime('now') 
        AND ab.uses_remaining > 0
    ''', (session['user_id'],)).fetchall()
    
    all_boosters = boosters + [b['type'] for b in active_db_boosters]
    
    # Apply booster effects
    effective_bet = bet_amount
    effective_mines = mines_count
    
    if 'mine_sniffer' in all_boosters:
        effective_mines = max(1, effective_mines - 1)
    
    if 'gold_pickaxe' in all_boosters:
        effective_bet = int(bet_amount * 1.5)
    
    money = conn.execute('SELECT balance FROM money WHERE user_id = ?', (session['user_id'],)).fetchone()
    if not money or money['balance'] < effective_bet:
        conn.close()
        return jsonify({'success': False, 'message': 'insufficient balance'})
    
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO mines_games (user_id, grid_size, mines_count, bet_amount)
        VALUES (?, ?, ?, ?)
    ''', (session['user_id'], grid_size, effective_mines, effective_bet))
    
    game_id = cursor.lastrowid
    
    mines_positions = generate_mines(grid_size, effective_mines, game_id)
    
    cursor.execute('UPDATE mines_games SET mines_positions = ? WHERE id = ?', 
                   (','.join(map(str, mines_positions)), game_id))
    
    cursor.execute('UPDATE money SET balance = balance - ? WHERE user_id = ?', 
                   (effective_bet, session['user_id']))
    
    # Reduce uses for active boosters
    for booster_type in all_boosters:
        cursor.execute('''
            UPDATE active_boosters 
            SET uses_remaining = uses_remaining - 1
            WHERE user_id = ? AND game = 'mines' 
            AND booster_id IN (SELECT id FROM shop_boosters WHERE type = ?)
            AND uses_remaining > 0
        ''', (session['user_id'], booster_type))
    
    conn.commit()
    
    game_data = {
        'host_id': session['user_id'],
        'game_type': 'mines',
        'game_id': game_id,
        'grid_size': grid_size,
        'mines_count': effective_mines,
        'bet_amount': effective_bet,
        'original_bet': bet_amount,
        'revealed_cells': [],
        'mines_positions': mines_positions,
        'potential_win': effective_bet,
        'boosters': all_boosters,
        'spectators': []
    }
    
    active_games[f"mines_{game_id}"] = game_data
    
    conn.close()
    
    return jsonify({
        'success': True,
        'game_id': game_id,
        'grid_size': grid_size,
        'mines_count': effective_mines,
        'bet_amount': effective_bet,
        'boosters': all_boosters
    })
def generate_mines(grid_size, mines_count, game_id):
    total_cells = grid_size * grid_size
    all_cells = list(range(total_cells))
    random.seed(game_id + int(time.time()))
    return random.sample(all_cells, mines_count)

@app.route('/api/mines/reveal', methods=['POST'])
def mines_reveal_with_boosters():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    game_id = data.get('game_id')
    cell_index = data.get('cell_index')
    has_kevlar = data.get('has_kevlar', False)
    
    conn = get_db_connection()
    
    game = conn.execute('SELECT * FROM mines_games WHERE id = ? AND user_id = ?', 
                       (game_id, session['user_id'])).fetchone()
    
    if not game:
        conn.close()
        return jsonify({'success': False, 'message': 'game not found'})
    
    if game['game_state'] != 'playing':
        conn.close()
        return jsonify({'success': False, 'message': 'game finished'})
    
    revealed_str = game['revealed_cells'] or ''
    revealed = [int(x) for x in revealed_str.split(',') if x.strip()]
    
    if cell_index in revealed:
        conn.close()
        return jsonify({'success': False, 'message': 'cell already revealed'})
    
    grid_size = game['grid_size']
    mines_count = game['mines_count']
    mines_positions = [int(x) for x in game['mines_positions'].split(',') if x.strip()]
    
    revealed.append(cell_index)
    revealed_str = ','.join(map(str, revealed))
    
    cursor = conn.cursor()
    
    if cell_index in mines_positions:
        kevlar_saved = False
        if has_kevlar:
            kevlar_active = conn.execute('''SELECT 1 FROM active_boosters ab
                JOIN shop_boosters sb ON ab.booster_id = sb.id
                WHERE ab.user_id = ? AND ab.game = 'mines' 
                AND sb.type = 'kevlar_vest'
                AND ab.active_until > datetime('now') 
                AND ab.uses_remaining > 0''', (session['user_id'],)).fetchone()
            
            if kevlar_active:
                kevlar_saved = True
                cursor.execute('''UPDATE active_boosters SET uses_remaining = uses_remaining - 1
                    WHERE user_id = ? AND game = 'mines' 
                    AND booster_id IN (SELECT id FROM shop_boosters WHERE type = 'kevlar_vest')''', 
                    (session['user_id'],))
        
        if not kevlar_saved:
            cursor.execute('UPDATE mines_games SET game_state = ?, revealed_cells = ? WHERE id = ?', 
                           ('lost', revealed_str, game_id))
        
        game_key = f"mines_{game_id}"
        if game_key in active_games:
            active_games[game_key]['game_state'] = 'lost' if not kevlar_saved else 'playing'
            active_games[game_key]['revealed_cells'] = revealed
            
            # BROADCAST TO SPECTATORS
            socketio.emit('mines_game_over', {
                'game_id': game_id,
                'cell_index': cell_index,
                'mines_positions': mines_positions,
                'revealed_cells': revealed,
                'host_id': session['user_id'],
                'kevlar_saved': kevlar_saved
            })
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'result': 'mine',
            'revealed_cells': revealed,
            'game_state': 'lost' if not kevlar_saved else 'playing',
            'mines_positions': mines_positions,
            'kevlar_saved': kevlar_saved
        })
    else:
        safe_revealed = len([x for x in revealed if x not in mines_positions])
        base_multiplier = 1.0 + (safe_revealed * 0.5)
        bet_amount = game['bet_amount']
        
        gold_multiplier = 1.0
        gold_active = conn.execute('''SELECT 1 FROM active_boosters ab
            JOIN shop_boosters sb ON ab.booster_id = sb.id
            WHERE ab.user_id = ? AND ab.game = 'mines' 
            AND sb.type = 'gold_pickaxe'
            AND ab.active_until > datetime('now') 
            AND ab.uses_remaining > 0''', (session['user_id'],)).fetchone()
        
        if gold_active:
            gold_multiplier = 1.5
        
        final_multiplier = base_multiplier * gold_multiplier
        if final_multiplier < 1.0:
            final_multiplier = 1.0
        
        win_amount = int(game['bet_amount'] * final_multiplier)
        
        cursor.execute('UPDATE mines_games SET revealed_cells = ?, potential_win = ? WHERE id = ?', 
                       (revealed_str, win_amount, game_id))
        
        game_key = f"mines_{game_id}"
        if game_key in active_games:
            active_games[game_key]['revealed_cells'] = revealed
            active_games[game_key]['potential_win'] = win_amount
            
            # BROADCAST TO SPECTATORS
            socketio.emit('mines_cell_revealed', {
                'game_id': game_id,
                'cell_index': cell_index,
                'result': 'safe',
                'revealed_cells': revealed,
                'potential_win': win_amount,
                'host_id': session['user_id']
            })
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'result': 'safe',
            'revealed_cells': revealed,
            'potential_win': win_amount,
            'game_state': 'playing',
            'gold_multiplier': gold_multiplier
        })
@app.route('/api/mines/cashout', methods=['POST'])
def mines_cashout():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401

    data = request.get_json()
    game_id = data.get('game_id')

    conn = get_db_connection()
    
    game = conn.execute('SELECT * FROM mines_games WHERE id = ? AND user_id = ?', 
                       (game_id, session['user_id'])).fetchone()
    
    if not game:
        conn.close()
        return jsonify({'success': False, 'message': 'game not found'})
    
    if game['game_state'] != 'playing':
        conn.close()
        return jsonify({'success': False, 'message': 'game finished'})
    
    bet_amount = game['bet_amount']
    revealed_str = game['revealed_cells'] or ''
    revealed = [int(x) for x in revealed_str.split(',') if x.strip()]
    
    grid_size = game['grid_size']
    mines_count = game['mines_count']
    mines_positions = [int(x) for x in game['mines_positions'].split(',') if x.strip()]
    
    safe_revealed = len([x for x in revealed if x not in mines_positions])
    base_multiplier = 1.0 + (safe_revealed * 0.5)
    bet_multiplier_factor = 1.0
    
    if bet_amount >= 1000:
        bet_multiplier_factor = 0.5
    elif bet_amount >= 500:
        bet_multiplier_factor = 0.7
    elif bet_amount >= 250:
        bet_multiplier_factor = 0.85
    elif bet_amount >= 100:
        bet_multiplier_factor = 0.9
    
    final_multiplier = base_multiplier * bet_multiplier_factor
    if final_multiplier < 1.0:
        final_multiplier = 1.0
    
    win_amount = int(bet_amount * final_multiplier)
    existing_win = game['potential_win'] or 0
    win_amount = max(win_amount, existing_win)
    
    cursor = conn.cursor()
    cursor.execute('UPDATE money SET balance = balance + ? WHERE user_id = ?', 
                   (win_amount, session['user_id']))
    
    cursor.execute('UPDATE mines_games SET game_state = ? WHERE id = ?', 
                   ('cashed_out', game_id))
    
    game_key = f"mines_{game_id}"
    if game_key in active_games:
        active_games[game_key]['game_state'] = 'cashed_out'
        active_games[game_key]['finish_time'] = time.time()
        
        # BROADCAST TO SPECTATORS
        socketio.emit('mines_cashout', {
            'game_id': game_id,
            'win_amount': win_amount,
            'host_id': session['user_id']
        })
    
    conn.commit()
    
    money = conn.execute('SELECT balance FROM money WHERE user_id = ?', (session['user_id'],)).fetchone()
    
    conn.close()
    
    return jsonify({
        'success': True,
        'win_amount': win_amount,
        'new_balance': money['balance'],
        'game_state': 'cashed_out'
    })

def create_slots_game(user_id, bet_amount=10, slot_type='5x3'):
    """Create a new slots game for a user"""
    import time
    import random
    
    game_id = f"slots_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO slots_games (user_id, slot_type, bet_amount, current_bet, game_id)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, slot_type, bet_amount, bet_amount, game_id))
    
    conn.commit()
    conn.close()
    
    # Add to active games for real-time tracking
    game_data = {
        'host_id': user_id,
        'game_type': 'slots',
        'game_id': game_id,
        'slot_type': slot_type,
        'bet_amount': bet_amount,
        'current_bet': bet_amount,
        'last_win': 0,
        'total_spins': 0,
        'game_state': 'playing',
        'last_update': time.time(),
        'spectators': []
    }
    
    active_games[f"slots_{game_id}"] = game_data
    
    return game_id

@app.route('/api/slots/deduct-bet', methods=['POST'])
def slots_deduct_bet():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    bet_amount = data.get('bet_amount', 10)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    money = cursor.execute('SELECT balance FROM money WHERE user_id = ?', 
                          (session['user_id'],)).fetchone()
    
    if not money or money['balance'] < bet_amount:
        conn.close()
        return jsonify({'success': False, 'message': 'Insufficient balance'})
    
    cursor.execute('UPDATE money SET balance = balance - ? WHERE user_id = ?', 
                  (bet_amount, session['user_id']))
    
    conn.commit()
    money = cursor.execute('SELECT balance FROM money WHERE user_id = ?', 
                          (session['user_id'],)).fetchone()
    conn.close()
    
    return jsonify({
        'success': True,
        'new_balance': money['balance']
    })

@app.route('/api/slots/update-balance', methods=['POST'])
def update_slots_balance():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    win_amount = data.get('win_amount', 0)
    bet_amount = data.get('bet_amount', 0)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if win_amount > 0:
        cursor.execute('UPDATE money SET balance = balance + ? WHERE user_id = ?', 
                      (win_amount, session['user_id']))
    
    conn.commit()
    money = cursor.execute('SELECT balance FROM money WHERE user_id = ?', 
                          (session['user_id'],)).fetchone()
    conn.close()
    
    return jsonify({
        'success': True,
        'new_balance': money['balance'] if money else 0
    })
def update_slots_game(game_id, bet_amount=None, last_win=0, total_spins=None):
    """Update slots game statistics"""
    import time
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if bet_amount is not None:
        cursor.execute('''
            UPDATE slots_games 
            SET current_bet = ?, last_spin_at = CURRENT_TIMESTAMP
            WHERE game_id = ?
        ''', (bet_amount, game_id))
    
    if last_win > 0:
        cursor.execute('''
            UPDATE slots_games 
            SET last_win = ?, last_spin_at = CURRENT_TIMESTAMP
            WHERE game_id = ?
        ''', (last_win, game_id))
    
    if total_spins is not None:
        cursor.execute('''
            UPDATE slots_games 
            SET total_spins = ?, last_spin_at = CURRENT_TIMESTAMP
            WHERE game_id = ?
        ''', (total_spins, game_id))
    
    conn.commit()
    conn.close()
    
    # Update active games
    game_key = f"slots_{game_id}"
    if game_key in active_games:
        active_games[game_key]['last_update'] = time.time()
        if bet_amount is not None:
            active_games[game_key]['current_bet'] = bet_amount
        if last_win > 0:
            active_games[game_key]['last_win'] = last_win
        if total_spins is not None:
            active_games[game_key]['total_spins'] = total_spins

def cleanup_old_slots_games():
    """Remove old slots games from active games"""
    import time
    current_time = time.time()
    to_remove = []
    
    for game_key, game_data in active_games.items():
        if game_data['game_type'] == 'slots':
            # Remove slots games inactive for 5 minutes
            if current_time - game_data.get('last_update', 0) > 300:
                to_remove.append(game_key)
    
    for game_key in to_remove:
        del active_games[game_key]

def create_slots_game_for_spectating(user_id, bet_amount=10, slot_type='5x3'):
    """Create a slots game entry for spectating"""
    import time
    import random
    
    game_id = f"slots_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
    
    game_data = {
        'host_id': user_id,
        'game_type': 'slots',
        'game_id': game_id,
        'slot_type': slot_type,
        'bet_amount': bet_amount,
        'current_bet': bet_amount,
        'last_win': 0,
        'total_spins': 0,
        'game_state': 'playing',
        'last_update': time.time(),
        'spectators': []
    }
    
    active_games[f"slots_{game_id}"] = game_data
    return game_id

# Add this API endpoint
@app.route('/api/slots/spectate/start', methods=['POST'])
def slots_spectate_start():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    bet_amount = data.get('bet_amount', 10)
    slot_type = data.get('slot_type', '5x3')
    
    # Check if user already has a slots game
    user_id = session['user_id']
    existing_game = None
    
    for game_key, game_data in active_games.items():
        if game_key.startswith('slots_') and game_data['host_id'] == user_id:
            existing_game = game_data
            break
    
    if existing_game:
        game_id = existing_game['game_id']
        # Update existing game
        existing_game['current_bet'] = bet_amount
        existing_game['last_update'] = time.time()
    else:
        # Create new game
        game_id = create_slots_game_for_spectating(user_id, bet_amount, slot_type)
    
    return jsonify({
        'success': True,
        'game_id': game_id,
        'bet_amount': bet_amount,
        'slot_type': slot_type
    })

# Add socket event handlers for slots
@socketio.on('slots_spinning')
def handle_slots_spinning(data):
    game_id = data.get('game_id')
    bet_amount = data.get('bet_amount', 10)
    slot_type = data.get('slot_type', '5x3')
    
    game_key = f"slots_{game_id}"
    if game_key in active_games:
        active_games[game_key]['current_bet'] = bet_amount
        active_games[game_key]['last_update'] = time.time()
        active_games[game_key]['slot_type'] = slot_type
        
        # Broadcast to all spectators
        socketio.emit('slots_spinning', {
            'game_id': game_id,
            'bet_amount': bet_amount,
            'slot_type': slot_type,
            'host_id': active_games[game_key]['host_id']
        })

# Add these to app.py after the existing socket handlers

@socketio.on('mines_cell_revealed')
def handle_mines_cell_revealed(data):
    """When a player reveals a cell in mines game"""
    game_id = data.get('game_id')
    cell_index = data.get('cell_index')
    result = data.get('result')
    revealed_cells = data.get('revealed_cells', [])
    potential_win = data.get('potential_win')
    
    game_key = f"mines_{game_id}"
    if game_key in active_games:
        game_data = active_games[game_key]
        game_data['revealed_cells'] = revealed_cells
        game_data['potential_win'] = potential_win
        game_data['last_update'] = time.time()
        
        # Broadcast to spectators
        socketio.emit('mines_cell_revealed', {
            'game_id': game_id,
            'cell_index': cell_index,
            'result': result,
            'revealed_cells': revealed_cells,
            'potential_win': potential_win,
            'host_id': game_data['host_id']
        })

@socketio.on('mines_game_over')
def handle_mines_game_over(data):
    """When a player hits a mine"""
    game_id = data.get('game_id')
    mines_positions = data.get('mines_positions', [])
    
    game_key = f"mines_{game_id}"
    if game_key in active_games:
        game_data = active_games[game_key]
        game_data['game_state'] = 'lost'
        game_data['mines_positions'] = mines_positions
        game_data['finish_time'] = time.time()
        
        # Broadcast to spectators
        socketio.emit('mines_game_over', {
            'game_id': game_id,
            'mines_positions': mines_positions,
            'host_id': game_data['host_id']
        })

@socketio.on('mines_cashout')
def handle_mines_cashout(data):
    """When a player cashes out"""
    game_id = data.get('game_id')
    win_amount = data.get('win_amount')
    
    game_key = f"mines_{game_id}"
    if game_key in active_games:
        game_data = active_games[game_key]
        game_data['game_state'] = 'cashed_out'
        game_data['finish_time'] = time.time()
        
        # Broadcast to spectators
        socketio.emit('mines_cashout', {
            'game_id': game_id,
            'win_amount': win_amount,
            'host_id': game_data['host_id']
        })

@socketio.on('mines_update')
def handle_mines_update(data):
    """General mines game update"""
    game_id = data.get('game_id')
    revealed_cells = data.get('revealed_cells', [])
    potential_win = data.get('potential_win', 0)
    
    game_key = f"mines_{game_id}"
    if game_key in active_games:
        game_data = active_games[game_key]
        game_data['revealed_cells'] = revealed_cells
        game_data['potential_win'] = potential_win
        game_data['last_update'] = time.time()
        
        # Broadcast to all connected clients
        socketio.emit('mines_update', {
            'game_id': game_id,
            'revealed_cells': revealed_cells,
            'potential_win': potential_win,
            'host_id': game_data['host_id'],
            'game_state': game_data.get('game_state', 'playing')
        })

@socketio.on('slots_spin_complete')
def handle_slots_spin_complete(data):
    game_id = data.get('game_id')
    win_amount = data.get('win_amount', 0)
    bet_amount = data.get('bet_amount', 10)
    total_spins = data.get('total_spins', 0)
    
    game_key = f"slots_{game_id}"
    if game_key in active_games:
        game_data = active_games[game_key]
        game_data['last_win'] = win_amount
        game_data['current_bet'] = bet_amount
        game_data['total_spins'] = total_spins
        game_data['last_update'] = time.time()
        
        # Broadcast to all spectators
        socketio.emit('slots_spin_complete', {
            'game_id': game_id,
            'win_amount': win_amount,
            'bet_amount': bet_amount,
            'total_spins': total_spins,
            'host_id': game_data['host_id']
        })

@app.route('/api/crash/start', methods=['POST'])
def crash_start():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401

    data = request.get_json()
    bet_amount = data.get('bet_amount', 10)
    
    conn = get_db_connection()
    
    money = conn.execute('SELECT balance FROM money WHERE user_id = ?', (session['user_id'],)).fetchone()
    if not money or money['balance'] < bet_amount:
        conn.close()
        return jsonify({'success': False, 'message': 'insufficient balance'})
    
    import random
    
    base_crash_point = random.uniform(1.5, 10.0)
    
    bet_factor = 1.0
    if bet_amount >= 1000:
        bet_factor = 0.3
    elif bet_amount >= 500:
        bet_factor = 0.5
    elif bet_amount >= 100:
        bet_factor = 0.7
    elif bet_amount >= 50:
        bet_factor = 0.85
    elif bet_amount >= 25:
        bet_factor = 0.9
    
    volatility = random.uniform(0.8, 1.2)
    
    crash_point = base_crash_point * bet_factor * volatility
    crash_point = max(1.1, min(crash_point, 15.0))
    
    cursor = conn.cursor()
    cursor.execute('UPDATE money SET balance = balance - ? WHERE user_id = ?', 
                   (bet_amount, session['user_id']))
    
    game_id = int(time.time() * 1000) + random.randint(1000, 9999)
    
    game_data = {
        'host_id': session['user_id'],
        'game_type': 'crash',
        'game_id': game_id,
        'bet_amount': bet_amount,
        'crash_point': crash_point,
        'multiplier': 1.0,
        'game_state': 'playing',
        'start_time': time.time(),
        'spectators': []
    }
    
    active_games[f"crash_{game_id}"] = game_data
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'game_id': game_id,
        'bet_amount': bet_amount,
        'crash_point': round(crash_point, 2)
    })

@app.route('/api/crash/cashout', methods=['POST'])
def crash_cashout():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401

    data = request.get_json()
    game_id = data.get('game_id')
    multiplier = data.get('multiplier', 1.0)
    bet_amount = data.get('bet_amount', 10)

    conn = get_db_connection()
    
    win_amount = int(bet_amount * multiplier)
    
    cursor = conn.cursor()
    cursor.execute('UPDATE money SET balance = balance + ? WHERE user_id = ?', 
                   (win_amount, session['user_id']))
    
    game_key = f"crash_{game_id}"
    if game_key in active_games:
        active_games[game_key]['game_state'] = 'cashed_out'
        
        for spectator in active_games[game_key]['spectators']:
            socketio.emit('crash_update', {
                'game_id': game_id,
                'game_state': 'cashed_out',
                'multiplier': multiplier,
                'win_amount': win_amount
            }, room=spectator)
    
    conn.commit()
    money = conn.execute('SELECT balance FROM money WHERE user_id = ?', (session['user_id'],)).fetchone()
    
    conn.close()
    
    return jsonify({
        'success': True,
        'win_amount': win_amount,
        'new_balance': money['balance'],
        'multiplier': multiplier
    })

@app.route('/api/daily-reward', methods=['POST'])
def claim_daily_reward():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    
    today = datetime.now().date()
    
    user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    
    if user['last_claim']:
        last_claim_date = datetime.strptime(user['last_claim'], '%Y-%m-%d').date()
        if last_claim_date == today:
            conn.close()
            return jsonify({'success': False, 'message': 'already claimed today'})
    
    cursor = conn.cursor()
    
    if user['last_claim']:
        last_claim_date = datetime.strptime(user['last_claim'], '%Y-%m-%d').date()
        days_since = (today - last_claim_date).days
        
        if days_since == 1:
            new_streak = (user['streak'] or 0) + 1
        else:
            new_streak = 1
    else:
        new_streak = 1
    
    base_reward = 100
    streak_bonus = new_streak * 50
    total_reward = base_reward + streak_bonus
    
    cursor.execute('UPDATE money SET balance = balance + ? WHERE user_id = ?', 
                   (total_reward, session['user_id']))
    
    cursor.execute('UPDATE users SET last_claim = ?, streak = ? WHERE id = ?',
                   (str(today), new_streak, session['user_id']))
    
    conn.commit()
    
    money = conn.execute('SELECT balance FROM money WHERE user_id = ?', (session['user_id'],)).fetchone()
    
    conn.close()
    
    return jsonify({
        'success': True,
        'reward': total_reward,
        'streak': new_streak,
        'new_balance': money['balance'],
        'message': f'daily reward claimed! ${total_reward} added'
    })

@app.route('/api/daily-status')
def daily_status():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    
    user = conn.execute('SELECT last_claim, streak FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    
    today = datetime.now().date()
    claimed_today = False
    
    if user['last_claim']:
        last_claim_date = datetime.strptime(user['last_claim'], '%Y-%m-%d').date()
        claimed_today = last_claim_date == today
    
    conn.close()
    
    return jsonify({
        'claimed_today': claimed_today,
        'streak': user['streak'] or 0,
        'last_claim': user['last_claim']
    })

@app.route('/api/leaderboard')
def get_leaderboard():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    
    leaderboard = conn.execute('''
        SELECT u.id, u.username, m.balance, p.avatar, u.status, u.streak
        FROM users u
        LEFT JOIN money m ON u.id = m.user_id
        LEFT JOIN profiles p ON u.id = p.user_id
        ORDER BY m.balance DESC
        LIMIT 20
    ''').fetchall()
    
    leaderboard_list = []
    for i, user in enumerate(leaderboard):
        is_you = user['id'] == session['user_id']
        leaderboard_list.append({
            'rank': i + 1,
            'id': user['id'],
            'username': user['username'],
            'balance': user['balance'] if user['balance'] else 0,
            'avatar': user['avatar'] if user['avatar'] else '/static/default-avatar.png',
            'status': user['status'],
            'streak': user['streak'] or 0,
            'is_you': is_you
        })
    
    conn.close()
    return jsonify(leaderboard_list)

@app.route('/api/players-in-game')
def get_players_in_game():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    players_in_game = []
    
    for game_key, game_data in active_games.items():
        # Skip if host is current user
        if game_data['host_id'] == session['user_id']:
            continue
        
        # Include mines AND slots games
        if game_data['game_type'] not in ['mines', 'slots']:
            continue
        
        # For slots games, check if they're still "spectatable"
        if game_data['game_type'] == 'slots':
            # Keep slots games active for 30 seconds after last spin
            spectating_until = game_data.get('spectating_until', 0)
            if time.time() > spectating_until:
                continue  # Skip old slots games
        
        # For mines games, check last update
        elif game_data['game_type'] == 'mines':
            if 'last_update' in game_data and time.time() - game_data['last_update'] > 120:
                continue
        
        conn = get_db_connection()
        user = conn.execute('''
            SELECT u.id, u.username, p.avatar, m.balance
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            LEFT JOIN money m ON u.id = m.user_id
            WHERE u.id = ?
        ''', (game_data['host_id'],)).fetchone()
        conn.close()
        
        if user:
            players_in_game.append({
                'user_id': user['id'],
                'username': user['username'],
                'avatar': user['avatar'] if user['avatar'] else '/static/default-avatar.png',
                'balance': user['balance'] if user['balance'] else 0,
                'game_type': game_data['game_type'],
                'game_id': game_data['game_id']
            })
    
    return jsonify(players_in_game)


@socketio.on('get_online_users')
def handle_get_online_users():
    """Send list of online users to client"""
    emit('online_users', list(online_users.keys()))

@socketio.on('request_game_status')
def handle_request_game_status():
    """Send current game status for all online users"""
    user_id = session.get('user_id')
    if user_id:
        # Send game status for all users in online_users
        for uid, user_data in online_users.items():
            if uid != user_id:  # Don't send self
                emit('game_status_update', {
                    'user_id': uid,
                    'game': user_data.get('game')
                })



@app.route('/api/spectate/start', methods=['POST'])
def start_spectating():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    host_id = data.get('host_id')
    game_type = data.get('game_type')
    game_id = data.get('game_id')
    
    if host_id == session['user_id']:
        return jsonify({'success': False, 'message': 'Cannot spectate yourself'})
    
    game_key = f"{game_type}_{game_id}"
    if game_key not in active_games:
        return jsonify({'success': False, 'message': 'Game not found or has ended'})
    
    if session['user_id'] in active_games[game_key]['spectators']:
        return jsonify({'success': False, 'message': 'Already spectating this game'})
    
    active_games[game_key]['spectators'].append(session['user_id'])
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO spectators (host_id, spectator_id, game_type, game_id)
        VALUES (?, ?, ?, ?)
    ''', (host_id, session['user_id'], game_type, game_id))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'message': 'Spectating started'
    })

@app.route('/api/slots/register-game', methods=['POST'])
def register_slots_game():
    """Register a slots game for spectating"""
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    bet_amount = data.get('bet_amount', 10)
    slot_type = data.get('slot_type', '5x3')
    
    user_id = session['user_id']
    
    # Check if user already has a slots game
    existing_game_key = None
    for game_key, game_data in active_games.items():
        if game_key.startswith('slots_') and game_data['host_id'] == user_id:
            existing_game_key = game_key
            break
    
    import time
    import random
    
    if existing_game_key:
        # Update existing game
        game_data = active_games[existing_game_key]
        game_data['current_bet'] = bet_amount
        game_data['slot_type'] = slot_type
        game_data['last_update'] = time.time()
        game_id = game_data['game_id']
    else:
        # Create new game
        game_id = f"slots_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
        
        game_data = {
            'host_id': user_id,
            'game_type': 'slots',
            'game_id': game_id,
            'slot_type': slot_type,
            'bet_amount': bet_amount,
            'current_bet': bet_amount,
            'last_win': 0,
            'total_spins': 0,
            'game_state': 'playing',
            'last_update': time.time(),
            'spectators': []
        }
        
        active_games[f"slots_{game_id}"] = game_data
    
    # Update user status to show playing slots
    socketio.emit('user_status', {
        'user_id': user_id,
        'status': 'online',
        'game': 'slots'
    })
    
    return jsonify({
        'success': True,
        'game_id': game_id,
        'bet_amount': bet_amount,
        'slot_type': slot_type
    })


@socketio.on('slots_spinning')
def handle_slots_spinning(data):
    """When a player starts spinning slots"""
    game_id = data.get('game_id')
    bet_amount = data.get('bet_amount', 10)
    slot_type = data.get('slot_type', '5x3')
    
    game_key = f"slots_{game_id}"
    if game_key in active_games:
        game_data = active_games[game_key]
        game_data['current_bet'] = bet_amount
        game_data['slot_type'] = slot_type
        game_data['last_update'] = time.time()
        
        # Update game for 30 seconds (spectating window)
        game_data['spectating_until'] = time.time() + 30
        
        # Broadcast to spectators
        socketio.emit('slots_spinning', {
            'game_id': game_id,
            'bet_amount': bet_amount,
            'slot_type': slot_type,
            'host_id': game_data['host_id']
        })

@socketio.on('slots_spin_complete')
def handle_slots_spin_complete(data):
    """When a player completes a slots spin"""
    game_id = data.get('game_id')
    win_amount = data.get('win_amount', 0)
    bet_amount = data.get('bet_amount', 10)
    total_spins = data.get('total_spins', 0)
    
    game_key = f"slots_{game_id}"
    if game_key in active_games:
        game_data = active_games[game_key]
        game_data['last_win'] = win_amount
        game_data['current_bet'] = bet_amount
        game_data['total_spins'] = total_spins
        game_data['last_update'] = time.time()
        
        # Update game for 30 seconds
        game_data['spectating_until'] = time.time() + 30
        
        # Broadcast to spectators
        socketio.emit('slots_spin_complete', {
            'game_id': game_id,
            'win_amount': win_amount,
            'bet_amount': bet_amount,
            'total_spins': total_spins,
            'host_id': game_data['host_id']
        })

@socketio.on('slots_game_ended')
def handle_slots_game_ended(data):
    """When a player leaves slots game"""
    game_id = data.get('game_id')
    
    game_key = f"slots_{game_id}"
    if game_key in active_games:
        host_id = active_games[game_key]['host_id']
        
        # Remove the game
        del active_games[game_key]
        
        # Update user status
        socketio.emit('user_status', {
            'user_id': host_id,
            'status': 'online',
            'game': None
        })


@app.route('/api/spectate/stop', methods=['POST'])
def stop_spectating():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    game_type = data.get('game_type')
    game_id = data.get('game_id')
    
    game_key = f"{game_type}_{game_id}"
    if game_key in active_games:
        if session['user_id'] in active_games[game_key]['spectators']:
            active_games[game_key]['spectators'].remove(session['user_id'])
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM spectators WHERE spectator_id = ? AND game_id = ?', 
                   (session['user_id'], game_id))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/spectate/game-data')
def get_game_data():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    game_type = request.args.get('game_type')
    game_id = request.args.get('game_id')
    
    game_key = f"{game_type}_{game_id}"
    if game_key not in active_games:
        return jsonify({'success': False, 'message': 'Game not found'})
    
    game_data = active_games[game_key]
    
    if session['user_id'] not in game_data['spectators'] and session['user_id'] != game_data['host_id']:
        return jsonify({'success': False, 'message': 'Not authorized to view this game'})
    
    conn = get_db_connection()
    host = conn.execute('''
        SELECT u.username, p.avatar, m.balance
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        LEFT JOIN money m ON u.id = m.user_id
        WHERE u.id = ?
    ''', (game_data['host_id'],)).fetchone()
    conn.close()
    
    return jsonify({
        'success': True,
        'game_data': {
            **game_data,
            'host_username': host['username'],
            'host_avatar': host['avatar'] if host['avatar'] else '/static/default-avatar.png',
            'host_balance': host['balance'] if host['balance'] else 0
        }
    })

@socketio.on('connect')
def handle_connect():
    if 'user_id' in session:
        user_id = session['user_id']
        username = session['username']
        online_users[user_id] = {
            'username': username,
            'sid': request.sid,
            'game': None
        }

        conn = get_db_connection()
        conn.execute('UPDATE users SET status = ? WHERE id = ?', ('online', user_id))
        conn.commit()
        conn.close()

        # Emit user status to all clients
        emit('user_status', {
            'user_id': user_id, 
            'status': 'online',
            'game': None
        }, broadcast=True)  # This one CAN use broadcast because it's from an event handler

@socketio.on('game_status')
def handle_game_status(data):
    if 'user_id' in session:
        user_id = session['user_id']
        game = data.get('game')
        
        if user_id in online_users:
            online_users[user_id]['game'] = game
        
        emit('user_status', {
            'user_id': user_id,
            'status': 'online',
            'game': game
        })

@socketio.on('disconnect')
def handle_disconnect():
    if 'user_id' in session:
        user_id = session['user_id']
        if user_id in online_users:
            del online_users[user_id]

        conn = get_db_connection()
        conn.execute('UPDATE users SET status = ?, last_seen = ? WHERE id = ?', 
                    ('offline', datetime.now(), user_id))
        conn.commit()
        conn.close()

        # Remove all games hosted by this user
        games_to_remove = []
        for game_key, game_data in active_games.items():
            if game_data['host_id'] == user_id:
                games_to_remove.append(game_key)
        
        for game_key in games_to_remove:
            del active_games[game_key]
        
        # Emit without broadcast parameter
        emit('user_went_offline', {
            'user_id': user_id,
            'game_keys': games_to_remove
        })

    emit('user_status', {
        'user_id': user_id, 
        'status': 'offline',
        'game': None
    })

@socketio.on('pvp_move')
def handle_pvp_move(data):
    """Handle a PVP move"""
    game_id = data.get('game_id')
    cell_index = data.get('cell_index')
    user_id = session.get('user_id')
    
    if not user_id:
        return
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get game info with lobby data
    game = conn.execute('''
        SELECT g.*, l.grid_size, l.mines_count, l.bet_amount
        FROM pvp_games g
        JOIN pvp_lobbies l ON g.lobby_id = l.id
        WHERE g.id = ?
    ''', (game_id,)).fetchone()
    
    if not game:
        conn.close()
        emit('pvp_error', {'message': 'Game not found'}, room=request.sid)
        return
    
    if game['game_state'] != 'playing':
        conn.close()
        emit('pvp_error', {'message': 'Game already finished'}, room=request.sid)
        return
    
    if game['current_turn'] != user_id:
        conn.close()
        emit('pvp_error', {'message': 'Not your turn'}, room=request.sid)
        return
    
    # Determine which player
    is_player1 = game['player1_id'] == user_id
    revealed_field = 'player1_revealed' if is_player1 else 'player2_revealed'
    score_field = 'player1_score' if is_player1 else 'player2_score'
    opponent_field = 'player2_revealed' if is_player1 else 'player1_revealed'
    
    # Process move
    revealed_str = game[revealed_field] or ''
    revealed = [int(x) for x in revealed_str.split(',') if x]
    
    if cell_index in revealed:
        conn.close()
        emit('pvp_error', {'message': 'Cell already revealed'}, room=request.sid)
        return
    
    mines_positions = [int(x) for x in game['mines_positions'].split(',') if x]
    
    # Add to revealed cells
    revealed.append(cell_index)
    revealed_str = ','.join(map(str, revealed))
    
    # Get usernames for both players
    player1 = conn.execute('SELECT username FROM users WHERE id = ?', (game['player1_id'],)).fetchone()
    player2 = conn.execute('SELECT username FROM users WHERE id = ?', (game['player2_id'],)).fetchone()
    
    player1_username = player1['username'] if player1 else 'Player 1'
    player2_username = player2['username'] if player2 else 'Player 2'
    
    # Check if hit mine
    if cell_index in mines_positions:
        # Player loses - END GAME
        winner_id = game['player2_id'] if is_player1 else game['player1_id']
        loser_id = user_id
        
        # Update game state
        cursor.execute(f'''
            UPDATE pvp_games 
            SET {revealed_field} = ?, 
                game_state = 'finished', 
                winner_id = ?
            WHERE id = ?
        ''', (revealed_str, winner_id, game_id))
        
        # Pay out winner (2x bet amount - winner gets both bets)
        winnings = game['bet_amount'] * 2
        cursor.execute('UPDATE money SET balance = balance + ? WHERE user_id = ?',
                     (winnings, winner_id))
        
        conn.commit()
        
        # Get all mines positions
        all_mines = [int(x) for x in game['mines_positions'].split(',') if x]
        
        # Get final game state with both players' revealed cells
        final_game = conn.execute('''
            SELECT g.*, l.grid_size, l.mines_count, l.bet_amount
            FROM pvp_games g
            JOIN pvp_lobbies l ON g.lobby_id = l.id
            WHERE g.id = ?
        ''', (game_id,)).fetchone()
        
        # Prepare final state data
        final_data = {
            'player1_revealed': final_game['player1_revealed'].split(',') if final_game['player1_revealed'] else [],
            'player2_revealed': final_game['player2_revealed'].split(',') if final_game['player2_revealed'] else [],
            'player1_score': final_game['player1_score'],
            'player2_score': final_game['player2_score'],
            'game_state': 'finished'
        }
        
        # Send SINGLE game end event with all data
        socketio.emit('pvp_game_ended', {
            'game_id': game_id,
            'winner_id': winner_id,
            'winnings': winnings,
            'cell_index': cell_index,
            'mine_hit_by': loser_id,
            'all_mines': all_mines,
            'final_game': final_data,
            'player1_username': player1_username,
            'player2_username': player2_username,
            'reason': 'mine_hit'
        }, room=f'pvp_game_{game_id}')
        
        conn.close()
        return  # Exit early - game ended
        
    else:
        # Safe cell, add score
        new_score = game[score_field] + 1
        next_turn = game['player2_id'] if is_player1 else game['player1_id']
        
        # Update game state
        cursor.execute(f'''
            UPDATE pvp_games 
            SET {revealed_field} = ?, {score_field} = ?, current_turn = ?
            WHERE id = ?
        ''', (revealed_str, new_score, next_turn, game_id))
        
        # Get updated game state
        updated_game = conn.execute('''
            SELECT g.*, l.grid_size, l.mines_count, l.bet_amount
            FROM pvp_games g
            JOIN pvp_lobbies l ON g.lobby_id = l.id
            WHERE g.id = ?
        ''', (game_id,)).fetchone()
        
        # Check for win condition (score-based win)
        target_score = 5  # First to 5 points wins
        
        game_ended = False
        winner_id = None
        
        if updated_game['player1_score'] >= target_score:
            winner_id = updated_game['player1_id']
            game_ended = True
        elif updated_game['player2_score'] >= target_score:
            winner_id = updated_game['player2_id']
            game_ended = True
        
        if game_ended:
            # Update final game state
            cursor.execute('''
                UPDATE pvp_games 
                SET game_state = 'finished', winner_id = ?
                WHERE id = ?
            ''', (winner_id, game_id))
            
            # Pay out winner
            winnings = updated_game['bet_amount'] * 2
            cursor.execute('UPDATE money SET balance = balance + ? WHERE user_id = ?',
                         (winnings, winner_id))
            
            conn.commit()
            
            # Get final state
            final_game = conn.execute('''
                SELECT g.*, l.grid_size, l.mines_count, l.bet_amount
                FROM pvp_games g
                JOIN pvp_lobbies l ON g.lobby_id = l.id
                WHERE g.id = ?
            ''', (game_id,)).fetchone()
            
            final_data = {
                'player1_revealed': final_game['player1_revealed'].split(',') if final_game['player1_revealed'] else [],
                'player2_revealed': final_game['player2_revealed'].split(',') if final_game['player2_revealed'] else [],
                'player1_score': final_game['player1_score'],
                'player2_score': final_game['player2_score'],
                'game_state': 'finished'
            }
            
            # Send game end event
            socketio.emit('pvp_game_ended', {
                'game_id': game_id,
                'winner_id': winner_id,
                'winnings': winnings,
                'final_game': final_data,
                'player1_username': player1_username,
                'player2_username': player2_username,
                'reason': 'score_win'
            }, room=f'pvp_game_{game_id}')
            
            # Also send a cell revealed event for UI update
            socketio.emit('pvp_cell_revealed', {
                'game_id': game_id,
                'cell_index': cell_index,
                'result': 'safe',
                'player_id': user_id,
                'score': new_score,
                'next_turn': next_turn,
                'game_ended': True,
                'updated_game': {
                    'player1_revealed': updated_game['player1_revealed'].split(',') if updated_game['player1_revealed'] else [],
                    'player2_revealed': updated_game['player2_revealed'].split(',') if updated_game['player2_revealed'] else [],
                    'player1_score': updated_game['player1_score'],
                    'player2_score': updated_game['player2_score'],
                    'current_turn': updated_game['current_turn'],
                    'game_state': 'finished'
                }
            }, room=f'pvp_game_{game_id}')
            
            conn.close()
            return
        
        else:
            conn.commit()
            
            # Send SINGLE cell revealed event (no game end)
            socketio.emit('pvp_cell_revealed', {
                'game_id': game_id,
                'cell_index': cell_index,
                'result': 'safe',
                'player_id': user_id,
                'score': new_score,
                'next_turn': next_turn,
                'game_ended': False,
                'updated_game': {
                    'player1_revealed': updated_game['player1_revealed'].split(',') if updated_game['player1_revealed'] else [],
                    'player2_revealed': updated_game['player2_revealed'].split(',') if updated_game['player2_revealed'] else [],
                    'player1_score': updated_game['player1_score'],
                    'player2_score': updated_game['player2_score'],
                    'current_turn': updated_game['current_turn'],
                    'game_state': 'playing'
                }
            }, room=f'pvp_game_{game_id}')
            
            conn.close()
            return

@socketio.on('private_message')
def handle_private_message(data):
    sender_id = session['user_id']
    receiver_id = data['receiver_id']
    message = data['message']

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO messages (sender_id, receiver_id, message) 
        VALUES (?, ?, ?)
    ''', (sender_id, receiver_id, message))
    conn.commit()

    msg_id = cursor.lastrowid

    sender_profile = conn.execute('SELECT avatar FROM profiles WHERE user_id = ?', (sender_id,)).fetchone()
    sender_avatar = sender_profile['avatar'] if sender_profile and sender_profile['avatar'] else '/static/default-avatar.png'

    conn.close()

    message_data = {
        'id': msg_id,
        'sender_id': sender_id,
        'receiver_id': receiver_id,
        'message': message,
        'timestamp': datetime.now().isoformat(),
        'sender_name': session['username'],
        'sender_avatar': sender_avatar,
        'is_own': False
    }

    # Send to sender
    emit('new_message', message_data, room=request.sid)

    # Send to receiver if they're online
    if receiver_id in online_users:
        receiver_sid = online_users[receiver_id]['sid']
        message_data['is_own'] = True
        emit('new_message', message_data, room=receiver_sid)


@socketio.on('typing')
def handle_typing(data):
    receiver_id = data['receiver_id']
    if receiver_id in online_users:
        receiver_sid = online_users[receiver_id]['sid']
        emit('user_typing', {
            'user_id': session['user_id'],
            'username': session['username']
        }, room=receiver_sid)

@socketio.on('stop_typing')
def handle_stop_typing(data):
    receiver_id = data['receiver_id']
    if receiver_id in online_users:
        receiver_sid = online_users[receiver_id]['sid']
        emit('user_stop_typing', {
            'user_id': session['user_id']
        }, room=receiver_sid)

@socketio.on('crash_update')
def handle_crash_update(data):
    game_id = data.get('game_id')
    multiplier = data.get('multiplier')
    
    game_key = f"crash_{game_id}"
    if game_key in active_games:
        active_games[game_key]['multiplier'] = multiplier
        active_games[game_key]['last_update'] = time.time()
        
        # Emit to all connected clients (from event handler, can use broadcast)
        emit('crash_live_update', {
            'game_id': game_id,
            'multiplier': multiplier,
            'host_id': active_games[game_key]['host_id']
        }, broadcast=True)

@socketio.on('crash_game_over')
def handle_crash_game_over(data):
    game_id = data.get('game_id')
    multiplier = data.get('multiplier')
    
    game_key = f"crash_{game_id}"
    if game_key in active_games:
        active_games[game_key]['multiplier'] = multiplier
        active_games[game_key]['game_state'] = 'crashed'
        active_games[game_key]['finish_time'] = time.time()
        
        # Emit to all connected clients (from event handler, can use broadcast)
        emit('crash_game_over', {
            'game_id': game_id,
            'multiplier': multiplier,
            'host_id': active_games[game_key]['host_id']
        }, broadcast=True)



@app.route('/pvp')
def pvp_lobby():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('pvp.html')


@app.route('/api/pvp/lobbies')
def get_pvp_lobbies():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    lobbies = conn.execute('''
        SELECT l.*, 
               h.username as host_username, 
               hp.avatar as host_avatar,
               hm.balance as host_balance
        FROM pvp_lobbies l
        JOIN users h ON l.host_id = h.id
        LEFT JOIN profiles hp ON h.id = hp.user_id
        LEFT JOIN money hm ON h.id = hm.user_id
        WHERE l.status = 'waiting' AND l.host_id != ?
        ORDER BY l.created_at DESC
    ''', (session['user_id'],)).fetchall()
    
    lobbies_list = []
    for lobby in lobbies:
        lobbies_list.append({
            'id': lobby['id'],
            'host_id': lobby['host_id'],
            'host_username': lobby['host_username'],
            'host_avatar': lobby['host_avatar'] or '/static/default-avatar.png',
            'host_balance': lobby['host_balance'] or 0,
            'bet_amount': lobby['bet_amount'],
            'grid_size': lobby['grid_size'],
            'mines_count': lobby['mines_count'],
            'status': lobby['status'],
            'created_at': lobby['created_at']
        })
    
    conn.close()
    return jsonify(lobbies_list)


@app.route('/api/pvp/invites')
def get_pvp_invites():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    
    # Get received invites
    invites = conn.execute('''
        SELECT i.*, 
               u.username as from_username,
               p.avatar as from_avatar,
               m.balance as from_balance
        FROM pvp_invites i
        JOIN users u ON i.from_user_id = u.id
        LEFT JOIN profiles p ON u.id = p.user_id
        LEFT JOIN money m ON u.id = m.user_id
        WHERE i.to_user_id = ? 
        AND i.status = 'pending'
        AND i.expires_at > datetime('now')
        ORDER BY i.created_at DESC
    ''', (session['user_id'],)).fetchall()
    
    invites_list = []
    for invite in invites:
        invites_list.append({
            'id': invite['id'],
            'from_user_id': invite['from_user_id'],
            'from_username': invite['from_username'],
            'from_avatar': invite['from_avatar'] or '/static/default-avatar.png',
            'from_balance': invite['from_balance'] or 0,
            'bet_amount': invite['bet_amount'],
            'grid_size': invite['grid_size'],
            'mines_count': invite['mines_count'],
            'expires_at': invite['expires_at'],
            'created_at': invite['created_at']
        })
    
    conn.close()
    return jsonify(invites_list)

@app.route('/api/pvp/create-lobby', methods=['POST'])
def create_pvp_lobby():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    opponent_id = data.get('opponent_id')
    bet_amount = data.get('bet_amount', 10)
    grid_size = data.get('grid_size', 5)
    mines_count = data.get('mines_count', 5)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check balance
    money = conn.execute('SELECT balance FROM money WHERE user_id = ?', 
                        (session['user_id'],)).fetchone()
    if not money or money['balance'] < bet_amount:
        conn.close()
        return jsonify({'success': False, 'message': 'insufficient balance'})
    
    # Check if opponent exists and is online
    opponent = conn.execute('SELECT * FROM users WHERE id = ?', (opponent_id,)).fetchone()
    if not opponent:
        conn.close()
        return jsonify({'success': False, 'message': 'player not found'})
    
    # Create invite
    from datetime import datetime, timedelta
    expires_at = datetime.now() + timedelta(minutes=5)
    
    cursor.execute('''
        INSERT INTO pvp_invites (from_user_id, to_user_id, bet_amount, grid_size, mines_count, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (session['user_id'], opponent_id, bet_amount, grid_size, mines_count, expires_at))
    
    invite_id = cursor.lastrowid
    conn.commit()
    
    # Get host username for notification
    host_user = conn.execute('SELECT username FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    conn.close()
    
    # Notify opponent via socket
    socketio.emit('pvp_invite', {
        'invite_id': invite_id,
        'from_user_id': session['user_id'],
        'from_username': host_user['username'] if host_user else 'Unknown',
        'bet_amount': bet_amount,
        'grid_size': grid_size,
        'mines_count': mines_count,
        'expires_at': expires_at.strftime('%Y-%m-%d %H:%M:%S')
    }, room=f'user_{opponent_id}')
    
    return jsonify({
        'success': True,
        'invite_id': invite_id,
        'message': 'invite sent'
    })

@app.route('/api/pvp/accept-invite', methods=['POST'])
def accept_pvp_invite():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    invite_id = data.get('invite_id')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get invite
    invite = conn.execute('''
        SELECT * FROM pvp_invites 
        WHERE id = ? AND to_user_id = ? AND status = 'pending'
    ''', (invite_id, session['user_id'])).fetchone()
    
    if not invite:
        conn.close()
        return jsonify({'success': False, 'message': 'invite not found or expired'})
    
    # Check balances (existing code)
    host_money = conn.execute('SELECT balance FROM money WHERE user_id = ?', 
                              (invite['from_user_id'],)).fetchone()
    guest_money = conn.execute('SELECT balance FROM money WHERE user_id = ?', 
                               (session['user_id'],)).fetchone()
    
    if not host_money or host_money['balance'] < invite['bet_amount']:
        conn.close()
        return jsonify({'success': False, 'message': 'host has insufficient balance'})
    
    if not guest_money or guest_money['balance'] < invite['bet_amount']:
        conn.close()
        return jsonify({'success': False, 'message': 'you have insufficient balance'})
    
    # Deduct bets
    cursor.execute('UPDATE money SET balance = balance - ? WHERE user_id = ?',
                  (invite['bet_amount'], invite['from_user_id']))
    cursor.execute('UPDATE money SET balance = balance - ? WHERE user_id = ?',
                  (invite['bet_amount'], session['user_id']))
    
    # Create lobby
    cursor.execute('''
        INSERT INTO pvp_lobbies (host_id, guest_id, bet_amount, grid_size, mines_count, status)
        VALUES (?, ?, ?, ?, ?, 'active')
    ''', (invite['from_user_id'], session['user_id'], invite['bet_amount'], 
          invite['grid_size'], invite['mines_count']))
    
    lobby_id = cursor.lastrowid
    
    # Generate mines
    mines_positions = generate_mines(invite['grid_size'], invite['mines_count'], lobby_id)
    
    # Create game
    cursor.execute('''
        INSERT INTO pvp_games (lobby_id, player1_id, player2_id, current_turn, mines_positions)
        VALUES (?, ?, ?, ?, ?)
    ''', (lobby_id, invite['from_user_id'], session['user_id'], 
          invite['from_user_id'], ','.join(map(str, mines_positions))))
    
    game_id = cursor.lastrowid
    
    # Update invite status
    cursor.execute('UPDATE pvp_invites SET status = ? WHERE id = ?', ('accepted', invite_id))
    
    conn.commit()
    conn.close()
    
    # Notify BOTH players via socket
    socketio.emit('pvp_game_started', {
        'game_id': game_id,
        'lobby_id': lobby_id,
        'player1_id': invite['from_user_id'],
        'player2_id': session['user_id'],
        'current_turn': invite['from_user_id'],
        'bet_amount': invite['bet_amount'],
        'grid_size': invite['grid_size'],
        'mines_count': invite['mines_count']
    }, room=f'user_{invite["from_user_id"]}')
    
    socketio.emit('pvp_game_started', {
        'game_id': game_id,
        'lobby_id': lobby_id,
        'player1_id': invite['from_user_id'],
        'player2_id': session['user_id'],
        'current_turn': invite['from_user_id'],
        'bet_amount': invite['bet_amount'],
        'grid_size': invite['grid_size'],
        'mines_count': invite['mines_count']
    }, room=f'user_{session["user_id"]}')
    
    return jsonify({
        'success': True,
        'game_id': game_id,
        'lobby_id': lobby_id
    })
@app.route('/api/pvp/decline-invite', methods=['POST'])
def decline_pvp_invite():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    invite_id = data.get('invite_id')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE pvp_invites SET status = 'declined' 
        WHERE id = ? AND to_user_id = ?
    ''', (invite_id, session['user_id']))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})


@app.route('/api/pvp/game/<int:game_id>')
def get_pvp_game(game_id):
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    conn = get_db_connection()
    
    game = conn.execute('''
        SELECT g.*, 
               p1.username as player1_username, p1p.avatar as player1_avatar,
               p2.username as player2_username, p2p.avatar as player2_avatar,
               l.bet_amount, l.grid_size, l.mines_count
        FROM pvp_games g
        JOIN pvp_lobbies l ON g.lobby_id = l.id
        JOIN users p1 ON g.player1_id = p1.id
        JOIN users p2 ON g.player2_id = p2.id
        LEFT JOIN profiles p1p ON p1.id = p1p.user_id
        LEFT JOIN profiles p2p ON p2.id = p2p.user_id
        WHERE g.id = ? AND (g.player1_id = ? OR g.player2_id = ?)
    ''', (game_id, session['user_id'], session['user_id'])).fetchone()
    
    if not game:
        conn.close()
        return jsonify({'error': 'game not found'}), 404
    
    game_data = {
        'id': game['id'],
        'lobby_id': game['lobby_id'],
        'player1': {
            'id': game['player1_id'],
            'username': game['player1_username'],
            'avatar': game['player1_avatar'] or '/static/default-avatar.png',
            'revealed': [int(x) for x in game['player1_revealed'].split(',') if x],
            'score': game['player1_score']
        },
        'player2': {
            'id': game['player2_id'],
            'username': game['player2_username'],
            'avatar': game['player2_avatar'] or '/static/default-avatar.png',
            'revealed': [int(x) for x in game['player2_revealed'].split(',') if x],
            'score': game['player2_score']
        },
        'current_turn': game['current_turn'],
        'bet_amount': game['bet_amount'],
        'grid_size': game['grid_size'],
        'mines_count': game['mines_count'],
        'game_state': game['game_state'],
        'winner_id': game['winner_id'],
        'your_turn': game['current_turn'] == session['user_id']
    }
    
    conn.close()
    return jsonify(game_data)


@app.route('/api/pvp/reveal', methods=['POST'])
def pvp_reveal():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    game_id = data.get('game_id')
    cell_index = data.get('cell_index')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    game = conn.execute('SELECT * FROM pvp_games WHERE id = ?', (game_id,)).fetchone()
    
    if not game:
        conn.close()
        return jsonify({'success': False, 'message': 'game not found'})
    
    if game['game_state'] != 'playing':
        conn.close()
        return jsonify({'success': False, 'message': 'game is over'})
    
    if game['current_turn'] != session['user_id']:
        conn.close()
        return jsonify({'success': False, 'message': 'not your turn'})
    
    # Determine which player
    is_player1 = game['player1_id'] == session['user_id']
    revealed_field = 'player1_revealed' if is_player1 else 'player2_revealed'
    score_field = 'player1_score' if is_player1 else 'player2_score'
    
    revealed_str = game[revealed_field] or ''
    revealed = [int(x) for x in revealed_str.split(',') if x]
    
    if cell_index in revealed:
        conn.close()
        return jsonify({'success': False, 'message': 'cell already revealed'})
    
    mines_positions = [int(x) for x in game['mines_positions'].split(',') if x]
    
    revealed.append(cell_index)
    revealed_str = ','.join(map(str, revealed))
    
    # Check if hit mine
    if cell_index in mines_positions:
        # Player loses, switch turn to opponent or end game
        next_turn = game['player2_id'] if is_player1 else game['player1_id']
        
        cursor.execute(f'''
            UPDATE pvp_games 
            SET {revealed_field} = ?, current_turn = ?
            WHERE id = ?
        ''', (revealed_str, next_turn, game_id))
        
        conn.commit()
        
        # Notify both players
        socketio.emit('pvp_turn_update', {
            'game_id': game_id,
            'cell_index': cell_index,
            'result': 'mine',
            'player_id': session['user_id'],
            'revealed': revealed,
            'next_turn': next_turn
        }, room=f'pvp_game_{game_id}')
        
        conn.close()
        return jsonify({
            'success': True,
            'result': 'mine',
            'revealed': revealed,
            'next_turn': next_turn
        })
    else:
        # Safe cell, add score
        new_score = game[score_field] + 1
        next_turn = game['player2_id'] if is_player1 else game['player1_id']
        
        cursor.execute(f'''
            UPDATE pvp_games 
            SET {revealed_field} = ?, {score_field} = ?, current_turn = ?
            WHERE id = ?
        ''', (revealed_str, new_score, next_turn, game_id))
        
        conn.commit()
        
        # Notify both players
        socketio.emit('pvp_turn_update', {
            'game_id': game_id,
            'cell_index': cell_index,
            'result': 'safe',
            'player_id': session['user_id'],
            'revealed': revealed,
            'score': new_score,
            'next_turn': next_turn
        }, room=f'pvp_game_{game_id}')
        
        conn.close()
        return jsonify({
            'success': True,
            'result': 'safe',
            'revealed': revealed,
            'score': new_score,
            'next_turn': next_turn
        })


@app.route('/api/pvp/end-turn', methods=['POST'])
def pvp_end_turn():
    if 'user_id' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    
    data = request.get_json()
    game_id = data.get('game_id')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    game = conn.execute('SELECT * FROM pvp_games WHERE id = ?', (game_id,)).fetchone()
    
    if not game or game['current_turn'] != session['user_id']:
        conn.close()
        return jsonify({'success': False, 'message': 'invalid request'})
    
    # Check if game should end (both players had their turn)
    p1_revealed = len([x for x in game['player1_revealed'].split(',') if x])
    p2_revealed = len([x for x in game['player2_revealed'].split(',') if x])
    
    # Determine winner
    if p1_revealed > p2_revealed:
        winner_id = game['player1_id']
    elif p2_revealed > p1_revealed:
        winner_id = game['player2_id']
    else:
        winner_id = None  # Draw
    
    cursor.execute('''
        UPDATE pvp_games 
        SET game_state = 'finished', winner_id = ?
        WHERE id = ?
    ''', (winner_id, game_id))
    
    # Pay out winner
    if winner_id:
        lobby = conn.execute('SELECT bet_amount FROM pvp_lobbies WHERE id = ?', 
                            (game['lobby_id'],)).fetchone()
        winnings = lobby['bet_amount'] * 2
        
        cursor.execute('UPDATE money SET balance = balance + ? WHERE user_id = ?',
                      (winnings, winner_id))
    
    conn.commit()
    conn.close()
    
    # Notify both players
    socketio.emit('pvp_game_end', {
        'game_id': game_id,
        'winner_id': winner_id
    }, room=f'pvp_game_{game_id}')
    
    return jsonify({
        'success': True,
        'winner_id': winner_id
    })


# Socket events for PVP
@socketio.on('join_pvp_game')
def handle_join_pvp_game(data):
    game_id = data.get('game_id')
    join_room(f'pvp_game_{game_id}')
    emit('pvp_joined', {'game_id': game_id})




@socketio.on('join_user_room')
def handle_join_user_room():
    """Join a user's private room for notifications"""
    if 'user_id' in session:
        user_id = session['user_id']
        join_room(f'user_{user_id}')

@socketio.on('join_pvp_game')
def handle_join_pvp_game(data):
    """Join a PVP game room"""
    game_id = data.get('game_id')
    if game_id:
        join_room(f'pvp_game_{game_id}')
        emit('pvp_joined', {'game_id': game_id}, room=request.sid)

@socketio.on('leave_pvp_game')
def handle_leave_pvp_game(data):
    """Leave a PVP game room"""
    game_id = data.get('game_id')
    if game_id:
        leave_room(f'pvp_game_{game_id}')
if __name__ == '__main__':
    init_db()
    socketio.run(app, debug=True, port=5000, allow_unsafe_werkzeug=True)