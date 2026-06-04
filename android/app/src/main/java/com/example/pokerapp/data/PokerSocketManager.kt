package com.example.pokerapp.data

import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI

object PokerSocketManager {
    private var socket: Socket? = null
    private val scope = CoroutineScope(Dispatchers.Main)

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _currentRoom = MutableStateFlow<String?>(null)
    val currentRoom: StateFlow<String?> = _currentRoom.asStateFlow()

    private val _roomState = MutableStateFlow<JSONObject?>(null)
    val roomState: StateFlow<JSONObject?> = _roomState.asStateFlow()

    private val _gameState = MutableStateFlow<JSONObject?>(null)
    val gameState: StateFlow<JSONObject?> = _gameState.asStateFlow()

    private val _privateHand = MutableStateFlow<List<String>?>(null)
    val privateHand: StateFlow<List<String>?> = _privateHand.asStateFlow()

    private val _myCoins = MutableStateFlow(0)
    val myCoins: StateFlow<Int> = _myCoins.asStateFlow()

    // Railway URL or Localhost depending on the environment
    // For android emulator accessing localhost use http://10.0.2.2:3000
    // We will hardcode to the Railway url or emulator depending on the environment.
    // Replace with your actual Railway URL if needed.
    val serverURL = "http://10.0.2.2:3000" 

    fun connectWithToken(token: String) {
        try {
            val options = IO.Options.builder()
                .setAuth(mapOf("token" to token))
                .build()
            
            socket = IO.socket(URI.create(serverURL), options)
            setupEventHandlers()
            socket?.connect()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun disconnect() {
        socket?.disconnect()
        _isConnected.value = false
        _currentRoom.value = null
        _roomState.value = null
        _gameState.value = null
        _privateHand.value = null
    }

    private fun setupEventHandlers() {
        socket?.on(Socket.EVENT_CONNECT) {
            scope.launch {
                _isConnected.value = true
                println("Socket connected")
            }
        }

        socket?.on(Socket.EVENT_DISCONNECT) {
            scope.launch {
                _isConnected.value = false
                println("Socket disconnected")
            }
        }

        socket?.on("profileUpdated") { args ->
            if (args.isNotEmpty() && args[0] is JSONObject) {
                val update = args[0] as JSONObject
                if (update.has("coins")) {
                    scope.launch {
                        _myCoins.value = update.getInt("coins")
                    }
                }
            }
        }

        socket?.on("roomUpdated") { args ->
            if (args.isNotEmpty() && args[0] is JSONObject) {
                val state = args[0] as JSONObject
                scope.launch {
                    _roomState.value = state
                }
            }
        }

        socket?.on("gameState") { args ->
            if (args.isNotEmpty() && args[0] is JSONObject) {
                val state = args[0] as JSONObject
                scope.launch {
                    _gameState.value = state
                }
            }
        }

        socket?.on("privateHand") { args ->
            if (args.isNotEmpty() && args[0] is JSONArray) {
                val hand = args[0] as JSONArray
                val list = mutableListOf<String>()
                for (i in 0 until hand.length()) {
                    list.add(hand.getString(i))
                }
                scope.launch {
                    _privateHand.value = list
                }
            }
        }

        socket?.on("error") { args ->
            if (args.isNotEmpty()) {
                println("Socket Error: \${args[0]}")
            }
        }
    }

    // Actions
    fun joinRoom(roomCode: String, playerName: String) {
        val payload = JSONObject().apply {
            put("roomId", roomCode)
            put("username", playerName)
        }
        socket?.emit("join_room", payload)
        _currentRoom.value = roomCode
    }

    fun sitDown(roomCode: String, seatIndex: Int) {
        val payload = JSONObject().apply {
            put("roomId", roomCode)
            put("seatIndex", seatIndex)
        }
        socket?.emit("sit_down", payload)
    }

    fun bet(roomCode: String, amount: Int) {
        val payload = JSONObject().apply {
            put("roomId", roomCode)
            put("amount", amount)
        }
        socket?.emit("bet", payload)
    }

    fun fold(roomCode: String) {
        val payload = JSONObject().apply {
            put("roomId", roomCode)
        }
        socket?.emit("fold", payload)
    }

    fun startGame(roomCode: String) {
        val payload = JSONObject().apply {
            put("roomId", roomCode)
        }
        socket?.emit("start_game", payload)
    }

    fun leaveRoom() {
        _currentRoom.value?.let { roomCode ->
            val payload = JSONObject().apply {
                put("roomId", roomCode)
            }
            socket?.emit("leave_room", payload)
        }
        _currentRoom.value = null
        _roomState.value = null
        _gameState.value = null
        _privateHand.value = null
    }
}
