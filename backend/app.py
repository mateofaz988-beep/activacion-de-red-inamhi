from io import BytesIO
import json
import uuid
import smtplib
import html
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import re
import ipaddress
import datetime
from functools import wraps
from urllib.parse import urlparse

from flask import Flask, jsonify, request, send_file
import fitz

from werkzeug.utils import secure_filename
from flask_cors import CORS
from dotenv import load_dotenv

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image
)

import mysql.connector
from mysql.connector import Error

import jwt
import bcrypt

# =====================================================
# cargar variables de entorno
# =====================================================

load_dotenv()


# =====================================================
# configuración SMTP para envío de correos
# =====================================================

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)

# =====================================================
# función base para enviar correos
# =====================================================

def enviar_correo(destinatario, asunto, cuerpo, cuerpo_html=None):
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASSWORD:
        raise Exception(
            "configuración SMTP incompleta. revise SMTP_HOST, SMTP_USER y SMTP_PASSWORD en el archivo .env."
        )

    destinatario = limpiar_texto(destinatario).lower()

    if not destinatario:
        raise Exception("no existe correo destinatario.")

    mensaje = MIMEMultipart("alternative")
    mensaje["Subject"] = asunto
    mensaje["From"] = SMTP_FROM
    mensaje["To"] = destinatario

    mensaje.attach(MIMEText(cuerpo, "plain", "utf-8"))

    if cuerpo_html:
        mensaje.attach(MIMEText(cuerpo_html, "html", "utf-8"))

    servidor = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
    servidor.starttls()
    servidor.login(SMTP_USER, SMTP_PASSWORD)
    servidor.sendmail(SMTP_USER, [destinatario], mensaje.as_string())
    servidor.quit()

    print(f"correo enviado correctamente a {destinatario}")
    return True
# =====================================================
# configuración principal
# =====================================================

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_INAMHI_PATH = os.path.join(BASE_DIR, "static", "img", "logo_inamhi.png")

CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:4300",
            "http://127.0.0.1:4300",
            "http://10.0.5.120:4300",
            "http://10.0.153.69",
            "http://10.0.153.69:4300"
        ],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# =====================================================
# permitir preflight CORS global sin token
# =====================================================

@app.before_request
def manejar_preflight_cors():
    if request.method == "OPTIONS":
        respuesta = jsonify({
            "estado": "ok",
            "mensaje": "preflight correcto."
        })

        respuesta.headers.add("Access-Control-Allow-Origin", request.headers.get("Origin", "*"))
        respuesta.headers.add("Access-Control-Allow-Headers", "Content-Type, Authorization")
        respuesta.headers.add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        respuesta.headers.add("Access-Control-Allow-Credentials", "true")

        return respuesta, 200

app.config["MAX_CONTENT_LENGTH"] = 15 * 1024 * 1024  # 15 MB

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "inamhi_liberacion_web")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "inamhi_liberacion_web_secret_2026")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", 8))

BACKEND_HOST = os.getenv("BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", 5050))

# =====================================================
# carpetas de archivos
# =====================================================

UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")

DOCUMENTOS_FOLDER = os.path.join(UPLOAD_FOLDER, "documentos")
FIRMADOS_FOLDER = os.path.join(UPLOAD_FOLDER, "firmados")
ESCANEADOS_FOLDER = os.path.join(UPLOAD_FOLDER, "escaneados")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(DOCUMENTOS_FOLDER, exist_ok=True)
os.makedirs(FIRMADOS_FOLDER, exist_ok=True)
os.makedirs(ESCANEADOS_FOLDER, exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "logs"), exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["DOCUMENTOS_FOLDER"] = DOCUMENTOS_FOLDER
app.config["FIRMADOS_FOLDER"] = FIRMADOS_FOLDER
app.config["ESCANEADOS_FOLDER"] = ESCANEADOS_FOLDER


# =====================================================
# conexión mysql
# =====================================================

def get_db_connection():
    try:
        conexion = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )

        if conexion.is_connected():
            return conexion

        return None

    except Error as error:
        print("error al conectar con mysql:", error)
        return None


# =====================================================
# utilidades generales
# =====================================================

def limpiar_texto(valor):
    if valor is None:
        return ""
    return str(valor).strip()


def obtener_ip_cliente():
    forwarded_for = request.headers.get("X-Forwarded-For")

    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    return request.remote_addr


def normalizar_espacios(texto):
    texto = limpiar_texto(texto)
    return re.sub(r"\s+", " ", texto)


def validar_solo_letras_espacios(texto):
    patron = r"^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$"
    return re.match(patron, texto) is not None


def validar_correo_general(correo):
    correo = limpiar_texto(correo).lower()

    patron_correo = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"

    return re.match(patron_correo, correo) is not None


def validar_cedula_formato(cedula):
    cedula = limpiar_texto(cedula)
    return cedula.isdigit() and len(cedula) == 10


def validar_telefono_10_digitos(telefono):
    telefono = limpiar_texto(telefono)
    return telefono.isdigit() and len(telefono) == 10


def validar_ipv4(ip):
    ip = limpiar_texto(ip)

    try:
        ipaddress.IPv4Address(ip)
        return True
    except Exception:
        return False


def validar_url(url):
    url = limpiar_texto(url)

    if not url:
        return False

    if " " in url:
        return False

    try:
        resultado = urlparse(url)

        if resultado.scheme not in ["http", "https"]:
            return False

        if not resultado.netloc:
            return False

        return True

    except Exception:
        return False


def validar_fecha(fecha):
    fecha = limpiar_texto(fecha)

    try:
        datetime.datetime.strptime(fecha, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def convertir_fecha(fecha):
    return datetime.datetime.strptime(fecha, "%Y-%m-%d").date()


def generar_codigo_solicitud():
    anio = datetime.datetime.now().year
    prefijo = f"INAMHI-WEB-{anio}-"

    conexion = get_db_connection()

    if conexion is None:
        return None

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select codigo_solicitud
            from solicitudes
            where codigo_solicitud like %s
            order by id desc
            limit 1;
        """

        cursor.execute(sql, (f"{prefijo}%",))
        ultimo = cursor.fetchone()

        cursor.close()
        conexion.close()

        if ultimo is None:
            numero = 1
        else:
            codigo_actual = ultimo["codigo_solicitud"]
            numero_actual = int(codigo_actual.split("-")[-1])
            numero = numero_actual + 1

        return f"{prefijo}{str(numero).zfill(4)}"

    except Exception as error:
        print("error al generar código:", error)
        return None


def registrar_auditoria(usuario_id, solicitud_id, modulo, accion, descripcion, datos_anteriores=None, datos_nuevos=None):
    conexion = get_db_connection()

    if conexion is None:
        return False

    try:
        cursor = conexion.cursor()

        sql = """
            insert into auditoria (
                usuario_id,
                solicitud_id,
                modulo,
                accion,
                descripcion,
                datos_anteriores,
                datos_nuevos,
                ip_origen
            ) values (
                %s, %s, %s, %s, %s, %s, %s, %s
            );
        """

        import json

        cursor.execute(sql, (
            usuario_id,
            solicitud_id,
            modulo,
            accion,
            descripcion,
            json.dumps(datos_anteriores, ensure_ascii=False) if datos_anteriores else None,
            json.dumps(datos_nuevos, ensure_ascii=False) if datos_nuevos else None,
            obtener_ip_cliente()
        ))

        conexion.commit()
        cursor.close()
        conexion.close()

        return True

    except Error as error:
        print("error al registrar auditoría:", error)
        return False


# =====================================================
# validación fuerte de solicitud pública
# =====================================================

def validar_solicitud_publica(data):
    errores = {}

    nombres_completos = normalizar_espacios(data.get("nombres_completos"))
    cedula = limpiar_texto(data.get("cedula"))
    correo_institucional = limpiar_texto(data.get("correo_institucional")).lower()
    telefono_ext = limpiar_texto(data.get("telefono_ext"))
    dependencia = normalizar_espacios(data.get("dependencia"))
    area_unidad = normalizar_espacios(data.get("area_unidad"))
    cargo = normalizar_espacios(data.get("cargo"))
    fecha_solicitud = limpiar_texto(data.get("fecha_solicitud"))
    tipo_usuario = limpiar_texto(data.get("tipo_usuario"))
    nombre_usuario_externo = normalizar_espacios(data.get("nombre_usuario_externo"))
    direccion_ip = limpiar_texto(data.get("direccion_ip"))
    tiempo_vigencia_acceso = normalizar_espacios(data.get("tiempo_vigencia_acceso"))
    justificacion = normalizar_espacios(data.get("justificacion_necesidad_institucional"))
    paginas_web = data.get("paginas_web")

    # nombres completos
    if not nombres_completos:
        errores["nombres_completos"] = "los nombres completos son obligatorios."
    elif len(nombres_completos) < 5:
        errores["nombres_completos"] = "los nombres completos deben tener mínimo 5 caracteres."
    elif len(nombres_completos) > 200:
        errores["nombres_completos"] = "los nombres completos no pueden superar 200 caracteres."
    elif not validar_solo_letras_espacios(nombres_completos):
        errores["nombres_completos"] = "los nombres completos solo pueden contener letras y espacios."

    # cédula
    if not cedula:
        errores["cedula"] = "la cédula es obligatoria."
    elif not validar_cedula_formato(cedula):
        errores["cedula"] = "la cédula debe contener exactamente 10 números."

  # correo electrónico
    if not correo_institucional:
         errores["correo_institucional"] = "el correo electrónico es obligatorio."
    elif not validar_correo_general(correo_institucional):
        errores["correo_institucional"] = "ingrese un correo válido. ejemplo: usuario@gmail.com, usuario@outlook.com o usuario@inamhi.gob.ec."

    # teléfono
    if not telefono_ext:
        errores["telefono_ext"] = "el teléfono es obligatorio."
    elif not validar_telefono_10_digitos(telefono_ext):
        errores["telefono_ext"] = "el teléfono debe contener exactamente 10 números."

    # dependencia
    if not dependencia:
        errores["dependencia"] = "la dependencia es obligatoria."
    elif len(dependencia) < 3:
        errores["dependencia"] = "la dependencia debe tener mínimo 3 caracteres."
    elif len(dependencia) > 150:
        errores["dependencia"] = "la dependencia no puede superar 150 caracteres."

    # área / unidad
    if not area_unidad:
        errores["area_unidad"] = "el área o unidad es obligatoria."
    elif len(area_unidad) < 3:
        errores["area_unidad"] = "el área o unidad debe tener mínimo 3 caracteres."
    elif len(area_unidad) > 150:
        errores["area_unidad"] = "el área o unidad no puede superar 150 caracteres."

    # cargo
    if not cargo:
        errores["cargo"] = "el cargo es obligatorio."
    elif len(cargo) < 3:
        errores["cargo"] = "el cargo debe tener mínimo 3 caracteres."
    elif len(cargo) > 150:
        errores["cargo"] = "el cargo no puede superar 150 caracteres."

    # fecha
    if not fecha_solicitud:
        errores["fecha_solicitud"] = "la fecha de solicitud es obligatoria."
    elif not validar_fecha(fecha_solicitud):
        errores["fecha_solicitud"] = "la fecha debe tener formato yyyy-mm-dd."

    # tipo usuario
    tipos_validos = ["funcionario_inamhi", "externo"]

    if not tipo_usuario:
        errores["tipo_usuario"] = "el tipo de usuario es obligatorio."
    elif tipo_usuario not in tipos_validos:
        errores["tipo_usuario"] = "el tipo de usuario solo puede ser funcionario_inamhi o externo."

    # externo
    if tipo_usuario == "externo":
        if not nombre_usuario_externo:
            errores["nombre_usuario_externo"] = "el nombre del usuario externo es obligatorio."
        elif len(nombre_usuario_externo) < 5:
            errores["nombre_usuario_externo"] = "el nombre del usuario externo debe tener mínimo 5 caracteres."
        elif len(nombre_usuario_externo) > 200:
            errores["nombre_usuario_externo"] = "el nombre del usuario externo no puede superar 200 caracteres."

        if not direccion_ip:
            errores["direccion_ip"] = "la dirección ip es obligatoria para usuario externo."
        elif not validar_ipv4(direccion_ip):
            errores["direccion_ip"] = "la dirección ip debe tener formato ipv4 válido."

    if tipo_usuario == "funcionario_inamhi":
        if direccion_ip and not validar_ipv4(direccion_ip):
            errores["direccion_ip"] = "la dirección ip debe tener formato ipv4 válido."

    # vigencia
    if not tiempo_vigencia_acceso:
        errores["tiempo_vigencia_acceso"] = "el tiempo de vigencia del acceso es obligatorio."
    elif len(tiempo_vigencia_acceso) < 3:
        errores["tiempo_vigencia_acceso"] = "el tiempo de vigencia debe tener mínimo 3 caracteres."
    elif len(tiempo_vigencia_acceso) > 100:
        errores["tiempo_vigencia_acceso"] = "el tiempo de vigencia no puede superar 100 caracteres."

    # justificación
    if not justificacion:
        errores["justificacion_necesidad_institucional"] = "la justificación es obligatoria."
    elif len(justificacion) < 20:
        errores["justificacion_necesidad_institucional"] = "la justificación debe tener mínimo 20 caracteres."
    elif len(justificacion) > 2000:
        errores["justificacion_necesidad_institucional"] = "la justificación no puede superar 2000 caracteres."

    # páginas web
    if not isinstance(paginas_web, list):
        errores["paginas_web"] = "las páginas web deben enviarse como una lista."
    else:
        paginas_limpias = []

        for pagina in paginas_web:
            if isinstance(pagina, dict):
                url = limpiar_texto(pagina.get("url_pagina"))
                descripcion = normalizar_espacios(pagina.get("descripcion"))
            else:
                url = limpiar_texto(pagina)
                descripcion = ""

            if url:
                paginas_limpias.append({
                    "url_pagina": url,
                    "descripcion": descripcion
                })

        if len(paginas_limpias) < 1:
            errores["paginas_web"] = "debe ingresar al menos una página web importante."
        elif len(paginas_limpias) > 8:
            errores["paginas_web"] = "solo se permiten máximo 8 páginas web."
        else:
            for index, pagina in enumerate(paginas_limpias, start=1):
                if len(pagina["url_pagina"]) > 255:
                    errores[f"pagina_{index}"] = "la url no puede superar 255 caracteres."
                elif not validar_url(pagina["url_pagina"]):
                    errores[f"pagina_{index}"] = "la url debe ser válida e iniciar con http:// o https://."

                if len(pagina["descripcion"]) > 255:
                    errores[f"descripcion_pagina_{index}"] = "la descripción de la página no puede superar 255 caracteres."

    datos_limpios = {
        "nombres_completos": nombres_completos,
        "cedula": cedula,
        "correo_institucional": correo_institucional,
        "telefono_ext": telefono_ext,
        "dependencia": dependencia,
        "area_unidad": area_unidad,
        "cargo": cargo,
        "fecha_solicitud": fecha_solicitud,
        "tipo_usuario": tipo_usuario,
        "nombre_usuario_externo": nombre_usuario_externo if tipo_usuario == "externo" else None,
        "direccion_ip": direccion_ip if direccion_ip else None,
        "tiempo_vigencia_acceso": tiempo_vigencia_acceso,
        "justificacion_necesidad_institucional": justificacion,
        "paginas_web": []
    }

    if isinstance(paginas_web, list):
        for pagina in paginas_web:
            if isinstance(pagina, dict):
                url = limpiar_texto(pagina.get("url_pagina"))
                descripcion = normalizar_espacios(pagina.get("descripcion"))
            else:
                url = limpiar_texto(pagina)
                descripcion = ""

            if url:
                datos_limpios["paginas_web"].append({
                    "url_pagina": url,
                    "descripcion": descripcion
                })

    return errores, datos_limpios


# =====================================================
# utilidades de seguridad
# =====================================================

def crear_hash_password(password):
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hash_generado = bcrypt.hashpw(password_bytes, salt)
    return hash_generado.decode("utf-8")


def verificar_password(password_plano, password_hash):
    try:
        return bcrypt.checkpw(
            password_plano.encode("utf-8"),
            password_hash.encode("utf-8")
        )
    except Exception:
        return False


def generar_token(usuario):
    expiracion = datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRATION_HOURS)

    payload = {
        "id": usuario["id"],
        "usuario": usuario["usuario"],
        "correo": usuario["correo"],
        "rol": usuario["rol"],
        "exp": expiracion
    }

    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm="HS256")

    return token


def decodificar_token(token):
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# =====================================================
# middlewares / decoradores
# =====================================================

def token_requerido(f):
    @wraps(f)
    def decorador(*args, **kwargs):

        # =====================================================
        # permitir preflight CORS sin exigir token
        # =====================================================
        if request.method == "OPTIONS":
            return jsonify({
                "estado": "ok",
                "mensaje": "preflight correcto."
            }), 200

        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return jsonify({
                "estado": "error",
                "mensaje": "token no proporcionado"
            }), 401

        try:
            partes = auth_header.split(" ")

            if len(partes) != 2 or partes[0] != "Bearer":
                return jsonify({
                    "estado": "error",
                    "mensaje": "formato de token inválido"
                }), 401

            token = partes[1]
            payload = decodificar_token(token)

            if payload is None:
                return jsonify({
                    "estado": "error",
                    "mensaje": "token inválido o expirado"
                }), 401

            request.usuario_actual = payload

        except Exception as error:
            return jsonify({
                "estado": "error",
                "mensaje": "error al validar token",
                "error": str(error)
            }), 401

        return f(*args, **kwargs)

    return decorador


def roles_permitidos(*roles):
    def wrapper(f):
        @wraps(f)
        def decorador(*args, **kwargs):
            usuario_actual = getattr(request, "usuario_actual", None)

            if usuario_actual is None:
                return jsonify({
                    "estado": "error",
                    "mensaje": "usuario no autenticado"
                }), 401

            if usuario_actual["rol"] not in roles:
                return jsonify({
                    "estado": "error",
                    "mensaje": "no tiene permisos para acceder a este recurso",
                    "rol_actual": usuario_actual["rol"],
                    "roles_permitidos": roles
                }), 403

            return f(*args, **kwargs)

        return decorador

    return wrapper


# =====================================================
# funciones de usuario
# =====================================================

def obtener_usuario_por_username(username):
    conexion = get_db_connection()

    if conexion is None:
        return None

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select 
                u.id,
                u.rol_id,
                r.nombre as rol,
                u.nombres,
                u.apellidos,
                u.cedula,
                u.correo,
                u.usuario,
                u.password_hash,
                u.cargo,
                u.area_unidad,
                u.dependencia,
                u.telefono_ext,
                u.estado
            from usuarios u
            inner join roles r on r.id = u.rol_id
            where u.usuario = %s
            limit 1;
        """

        cursor.execute(sql, (username,))
        usuario = cursor.fetchone()

        cursor.close()
        conexion.close()

        return usuario

    except Error as error:
        print("error al obtener usuario:", error)
        return None


def obtener_usuario_por_id(usuario_id):
    conexion = get_db_connection()

    if conexion is None:
        return None

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select 
                u.id,
                u.rol_id,
                r.nombre as rol,
                u.nombres,
                u.apellidos,
                u.cedula,
                u.correo,
                u.usuario,
                u.cargo,
                u.area_unidad,
                u.dependencia,
                u.telefono_ext,
                u.estado,
                u.ultimo_acceso,
                u.created_at,
                u.updated_at
            from usuarios u
            inner join roles r on r.id = u.rol_id
            where u.id = %s
            limit 1;
        """

        cursor.execute(sql, (usuario_id,))
        usuario = cursor.fetchone()

        cursor.close()
        conexion.close()

        return usuario

    except Error as error:
        print("error al obtener usuario por id:", error)
        return None


def actualizar_ultimo_acceso(usuario_id):
    conexion = get_db_connection()

    if conexion is None:
        return False

    try:
        cursor = conexion.cursor()

        sql = """
            update usuarios
            set ultimo_acceso = now()
            where id = %s;
        """

        cursor.execute(sql, (usuario_id,))
        conexion.commit()

        cursor.close()
        conexion.close()

        return True

    except Error as error:
        print("error al actualizar último acceso:", error)
        return False


# =====================================================
# rutas de prueba
# =====================================================

@app.route("/", methods=["GET"])
def inicio():
    return jsonify({
        "estado": "ok",
        "mensaje": "backend inamhi liberación web funcionando correctamente",
        "puerto": BACKEND_PORT
    }), 200


@app.route("/api/test", methods=["GET"])
def test():
    return jsonify({
        "estado": "ok",
        "mensaje": "backend del sistema de liberacion web inamhi funcionando correctamente",
        "sistema": "sistema de gestion de solicitudes de liberacion web",
        "institucion": "inamhi",
        "version": "1.0.0",
        "backend_url": f"http://{BACKEND_HOST}:{BACKEND_PORT}"
    }), 200


@app.route("/api/test-db", methods=["GET"])
def test_db():
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos mysql",
            "base_datos": DB_NAME,
            "host": DB_HOST,
            "puerto": DB_PORT,
            "usuario": DB_USER
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("select database() as base_datos;")
        base = cursor.fetchone()

        cursor.execute("show tables;")
        tablas = cursor.fetchall()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "conexión exitosa con mysql",
            "base_datos": base["base_datos"],
            "tablas": tablas
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al consultar la base de datos",
            "error": str(error)
        }), 500
    
    # =====================================================
# prueba de correo SMTP
# =====================================================

@app.route("/api/test-correo", methods=["GET"])
def test_correo():
    try:
        correo_destino = request.args.get("correo") or SMTP_USER

        enviar_correo(
            destinatario=correo_destino,
            asunto="Prueba de correo SMTP - INAMHI",
            cuerpo="""
Este es un correo de prueba enviado desde el backend Flask del Sistema de Liberación Web INAMHI.

Si recibió este mensaje, la configuración SMTP funciona correctamente.
"""
        )

        return jsonify({
            "estado": "ok",
            "mensaje": "correo de prueba enviado correctamente.",
            "destinatario": correo_destino
        }), 200

    except Exception as error:
        print("ERROR TEST CORREO:", str(error))

        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo enviar el correo de prueba.",
            "error": str(error),
            "smtp_host": SMTP_HOST,
            "smtp_port": SMTP_PORT,
            "smtp_user_configurado": bool(SMTP_USER),
            "smtp_password_configurado": bool(SMTP_PASSWORD),
            "smtp_from": SMTP_FROM
        }), 500


# =====================================================
# solicitud pública
# =====================================================

@app.route("/api/public/solicitudes", methods=["POST"])
def registrar_solicitud_publica():
    data = request.get_json()

    if not data:
        return jsonify({
            "estado": "error",
            "mensaje": "no se recibieron datos para registrar la solicitud."
        }), 400

    errores, datos = validar_solicitud_publica(data)

    if errores:
        return jsonify({
            "estado": "error",
            "mensaje": "existen errores de validación en el formulario.",
            "errores": errores
        }), 400

    codigo_solicitud = generar_codigo_solicitud()

    if codigo_solicitud is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo generar el código de solicitud."
        }), 500

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor()

        sql_solicitud = """
            insert into solicitudes (
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                telefono_ext,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                nombre_usuario_externo,
                direccion_ip,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada
            ) values (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                'pendiente_firma_solicitante',
                'firma_solicitante',
                false
            );
        """

        valores_solicitud = (
            codigo_solicitud,
            datos["nombres_completos"],
            datos["cedula"],
            datos["correo_institucional"],
            datos["telefono_ext"],
            datos["dependencia"],
            datos["area_unidad"],
            datos["cargo"],
            convertir_fecha(datos["fecha_solicitud"]),
            datos["tipo_usuario"],
            datos["nombre_usuario_externo"],
            datos["direccion_ip"],
            datos["tiempo_vigencia_acceso"],
            datos["justificacion_necesidad_institucional"]
        )

        cursor.execute(sql_solicitud, valores_solicitud)
        solicitud_id = cursor.lastrowid

        sql_pagina = """
            insert into solicitud_paginas_web (
                solicitud_id,
                numero,
                url_pagina,
                descripcion
            ) values (
                %s, %s, %s, %s
            );
        """

        for index, pagina in enumerate(datos["paginas_web"], start=1):
            cursor.execute(sql_pagina, (
                solicitud_id,
                index,
                pagina["url_pagina"],
                pagina["descripcion"]
            ))

        conexion.commit()

        cursor.close()
        conexion.close()

        registrar_auditoria(
            usuario_id=None,
            solicitud_id=solicitud_id,
            modulo="solicitud_publica",
            accion="crear_solicitud",
            descripcion=f"solicitud pública creada con código {codigo_solicitud}",
            datos_anteriores=None,
            datos_nuevos={
                "codigo_solicitud": codigo_solicitud,
                "nombres_completos": datos["nombres_completos"],
                "cedula": datos["cedula"],
                "correo_institucional": datos["correo_institucional"],
                "estado": "pendiente_firma_solicitante",
                "etapa_actual": "firma_solicitante"
            }
        )

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitud registrada correctamente.",
            "solicitud": {
                "id": solicitud_id,
                "codigo_solicitud": codigo_solicitud,
                "estado": "pendiente_firma_solicitante",
                "etapa_actual": "firma_solicitante",
                "nombres_completos": datos["nombres_completos"],
                "correo_institucional": datos["correo_institucional"]
            }
        }), 201

    except Error as error:
        conexion.rollback()

        return jsonify({
            "estado": "error",
            "mensaje": "error al registrar la solicitud.",
            "error": str(error)
        }), 500


@app.route("/api/public/solicitudes/seguimiento/<codigo>", methods=["GET"])
def seguimiento_solicitud_publica(codigo):
    codigo = limpiar_texto(codigo).upper()

    if not codigo:
        return jsonify({
            "estado": "error",
            "mensaje": "el código de solicitud es obligatorio."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select
                id,
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada,
                created_at,
                updated_at
            from solicitudes
            where codigo_solicitud = %s
            limit 1;
        """

        cursor.execute(sql, (codigo,))
        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró una solicitud con ese código."
            }), 404

        sql_paginas = """
            select numero, url_pagina, descripcion
            from solicitud_paginas_web
            where solicitud_id = %s
            order by numero asc;
        """

        cursor.execute(sql_paginas, (solicitud["id"],))
        paginas = cursor.fetchall()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "solicitud": solicitud,
            "paginas_web": paginas
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al consultar la solicitud.",
            "error": str(error)
        }), 500


# =====================================================
# ruta temporal para generar contraseñas reales
# eliminar o comentar después de usar
# =====================================================

@app.route("/api/dev/reset-passwords", methods=["GET"])
def reset_passwords():
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con mysql"
        }), 500

    usuarios_passwords = [
        ("admin", "admin123"),
        ("jefe", "jefe123"),
        ("autoridad", "autoridad123"),
        ("tics", "tics123")
    ]

    try:
        cursor = conexion.cursor()

        for username, password in usuarios_passwords:
            password_hash = crear_hash_password(password)

            sql = """
                update usuarios
                set password_hash = %s
                where usuario = %s;
            """

            cursor.execute(sql, (password_hash, username))

        conexion.commit()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "contraseñas actualizadas correctamente",
            "usuarios": [
                {
                    "usuario": "admin",
                    "password": "admin123"
                },
                {
                    "usuario": "jefe",
                    "password": "jefe123"
                },
                {
                    "usuario": "autoridad",
                    "password": "autoridad123"
                },
                {
                    "usuario": "tics",
                    "password": "tics123"
                }
            ],
            "advertencia": "esta ruta es temporal. después de usarla, se recomienda comentarla o eliminarla."
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al actualizar contraseñas",
            "error": str(error)
        }), 500


# =====================================================
# autenticación
# =====================================================

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()

    if not data:
        return jsonify({
            "estado": "error",
            "mensaje": "no se recibieron datos"
        }), 400

    username = limpiar_texto(data.get("usuario"))
    password = limpiar_texto(data.get("password"))

    if not username or not password:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario y contraseña son obligatorios"
        }), 400

    usuario = obtener_usuario_por_username(username)

    if usuario is None:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario o contraseña incorrectos"
        }), 401

    if usuario["estado"] != "activo":
        return jsonify({
            "estado": "error",
            "mensaje": "usuario inactivo. comuníquese con el administrador."
        }), 403

    password_correcto = verificar_password(password, usuario["password_hash"])

    if not password_correcto:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario o contraseña incorrectos"
        }), 401

    token = generar_token(usuario)
    actualizar_ultimo_acceso(usuario["id"])

    return jsonify({
        "estado": "ok",
        "mensaje": "inicio de sesión exitoso",
        "token": token,
        "usuario": {
            "id": usuario["id"],
            "nombres": usuario["nombres"],
            "apellidos": usuario["apellidos"],
            "cedula": usuario["cedula"],
            "correo": usuario["correo"],
            "usuario": usuario["usuario"],
            "cargo": usuario["cargo"],
            "area_unidad": usuario["area_unidad"],
            "dependencia": usuario["dependencia"],
            "telefono_ext": usuario["telefono_ext"],
            "rol": usuario["rol"]
        }
    }), 200


@app.route("/api/auth/me", methods=["GET"])
@token_requerido
def auth_me():
    usuario_actual = request.usuario_actual
    usuario = obtener_usuario_por_id(usuario_actual["id"])

    if usuario is None:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario no encontrado"
        }), 404

    return jsonify({
        "estado": "ok",
        "usuario": usuario
    }), 200


@app.route("/api/admin/test", methods=["GET"])
@token_requerido
@roles_permitidos("administrador")
def admin_test():
    return jsonify({
        "estado": "ok",
        "mensaje": "acceso permitido solo para administrador",
        "usuario": request.usuario_actual
    }), 200


@app.route("/api/tics/test", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "analista_tics")
def tics_test():
    return jsonify({
        "estado": "ok",
        "mensaje": "acceso permitido para administrador o analista tics",
        "usuario": request.usuario_actual
    }), 200


# =====================================================
# solicitudes asignadas por rol
# =====================================================

@app.route("/api/mis-solicitudes", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def listar_mis_solicitudes():
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]
    usuario_id = usuario_actual["id"]

    busqueda = limpiar_texto(request.args.get("q"))

    reglas_por_rol = {
        "administrador": {
            "estados": [
                "pendiente_firma_solicitante",
                "pendiente_jefe_inmediato",
                "pendiente_maxima_autoridad",
                "pendiente_tics",
                "pendiente_ejecucion_tics",
                "finalizada",
                "rechazada_jefe_inmediato",
                "rechazada_maxima_autoridad",
                "rechazada_tics",
                "anulada"
            ],
            "etapas": None
        },
        "jefe_inmediato": {
            "estados": ["pendiente_jefe_inmediato"],
            "etapas": ["jefe_inmediato"]
        },
        "maxima_autoridad": {
            "estados": ["pendiente_maxima_autoridad"],
            "etapas": ["maxima_autoridad"]
        },
        "analista_tics": {
            "estados": ["pendiente_tics", "pendiente_ejecucion_tics"],
            "etapas": ["tics", "ejecucion_tics"]
        }
    }

    regla = reglas_por_rol.get(rol_actual)

    if regla is None:
        return jsonify({
            "estado": "error",
            "mensaje": "el rol actual no tiene solicitudes asignadas.",
            "rol": rol_actual
        }), 403

    estados_permitidos = regla["estados"]
    etapas_permitidas = regla["etapas"]

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        condiciones = []
        parametros = []

        # =====================================================
        # filtro por estado
        # =====================================================

        placeholders_estados = ", ".join(["%s"] * len(estados_permitidos))
        condiciones.append(f"s.estado in ({placeholders_estados})")
        parametros.extend(estados_permitidos)

        # =====================================================
        # filtro por etapa
        # =====================================================

        if etapas_permitidas:
            placeholders_etapas = ", ".join(["%s"] * len(etapas_permitidas))
            condiciones.append(f"s.etapa_actual in ({placeholders_etapas})")
            parametros.extend(etapas_permitidas)

        # =====================================================
        # filtro especial para jefe inmediato
        # cada jefe ve solo las solicitudes asignadas a su usuario
        # =====================================================

        if rol_actual == "jefe_inmediato":
            condiciones.append("s.jefe_asignado_id = %s")
            parametros.append(usuario_id)

        # =====================================================
        # búsqueda general
        # =====================================================

        if busqueda:
            condiciones.append("""
                (
                    s.codigo_solicitud like %s or
                    s.nombres_completos like %s or
                    s.cedula like %s or
                    s.correo_institucional like %s or
                    s.area_unidad like %s or
                    s.dependencia like %s or
                    s.cargo like %s
                )
            """)

            valor_busqueda = f"%{busqueda}%"

            parametros.extend([
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda
            ])

        where_sql = " and ".join(condiciones)

        sql = f"""
            select
                s.id,
                s.direccion_id,
                s.area_id,
                s.cargo_id,
                s.jefe_asignado_id,
                s.maxima_autoridad_id,
                s.codigo_solicitud,
                s.nombres_completos,
                s.cedula,
                s.correo_institucional,
                s.telefono_ext,
                s.dependencia,
                s.area_unidad,
                s.cargo,
                s.fecha_solicitud,
                s.tipo_usuario,
                s.nombre_usuario_externo,
                s.direccion_ip,
                s.tiempo_vigencia_acceso,
                s.justificacion_necesidad_institucional,
                s.estado,
                s.etapa_actual,
                s.bloqueada,
                s.created_at,
                s.updated_at,

                (
                    select count(*)
                    from solicitud_paginas_web p
                    where p.solicitud_id = s.id
                ) as total_paginas,

                (
                    select concat(p.nombres, ' ', ifnull(p.apellidos, ''))
                    from area_personal p
                    where p.area_id = s.area_id
                      and p.tipo_responsable = 'jefe_area'
                      and p.estado = 'activo'
                    order by p.id asc
                    limit 1
                ) as nombre_jefe_area

            from solicitudes s
            where {where_sql}
            order by s.id desc;
        """

        cursor.execute(sql, tuple(parametros))
        solicitudes = cursor.fetchall()

        for solicitud in solicitudes:
            solicitud["fecha_solicitud"] = serializar_fecha(solicitud["fecha_solicitud"])
            solicitud["created_at"] = serializar_fecha(solicitud["created_at"])
            solicitud["updated_at"] = serializar_fecha(solicitud["updated_at"])
            solicitud["bloqueada"] = bool(solicitud["bloqueada"]) if solicitud["bloqueada"] is not None else False
            solicitud["total_paginas"] = int(solicitud["total_paginas"] or 0)

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitudes asignadas obtenidas correctamente.",
            "rol": rol_actual,
            "usuario_id": usuario_id,
            "total": len(solicitudes),
            "solicitudes": solicitudes
        }), 200

    except Error as error:
        print("error al obtener solicitudes asignadas:", error)

        try:
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener solicitudes asignadas.",
            "error": str(error)
        }), 500
# =====================================================
# solicitudes administrativas
# =====================================================

def serializar_fecha(valor):
    if valor is None:
        return None

    if isinstance(valor, (datetime.datetime, datetime.date)):
        return valor.strftime("%Y-%m-%d %H:%M:%S")

    return str(valor)


@app.route("/api/admin/solicitudes", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "analista_tics", "jefe_inmediato", "maxima_autoridad")
def listar_solicitudes_admin():
    estado = limpiar_texto(request.args.get("estado"))
    busqueda = limpiar_texto(request.args.get("q"))

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        condiciones = []
        parametros = []

        if estado:
            condiciones.append("s.estado = %s")
            parametros.append(estado)

        if busqueda:
            condiciones.append("""
                (
                    s.codigo_solicitud like %s or
                    s.nombres_completos like %s or
                    s.cedula like %s or
                    s.correo_institucional like %s or
                    s.area_unidad like %s or
                    s.dependencia like %s
                )
            """)

            valor_busqueda = f"%{busqueda}%"
            parametros.extend([
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda
            ])

        where_sql = ""

        if condiciones:
            where_sql = "where " + " and ".join(condiciones)

        sql = f"""
            select
                s.id,
                s.codigo_solicitud,
                s.nombres_completos,
                s.cedula,
                s.correo_institucional,
                s.telefono_ext,
                s.dependencia,
                s.area_unidad,
                s.cargo,
                s.fecha_solicitud,
                s.tipo_usuario,
                s.nombre_usuario_externo,
                s.direccion_ip,
                s.tiempo_vigencia_acceso,
                s.justificacion_necesidad_institucional,
                s.estado,
                s.etapa_actual,
                s.bloqueada,
                s.created_at,
                s.updated_at,
                count(p.id) as total_paginas
            from solicitudes s
            left join solicitud_paginas_web p on p.solicitud_id = s.id
            {where_sql}
            group by s.id
            order by s.id desc;
        """

        cursor.execute(sql, tuple(parametros))
        solicitudes = cursor.fetchall()

        for solicitud in solicitudes:
            solicitud["fecha_solicitud"] = serializar_fecha(solicitud["fecha_solicitud"])
            solicitud["created_at"] = serializar_fecha(solicitud["created_at"])
            solicitud["updated_at"] = serializar_fecha(solicitud["updated_at"])

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitudes obtenidas correctamente.",
            "total": len(solicitudes),
            "solicitudes": solicitudes
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener solicitudes.",
            "error": str(error)
        }), 500


# =====================================================
# generación de PDF A4 de solicitud
# =====================================================

def obtener_solicitud_completa_para_pdf(solicitud_id):
    conexion = get_db_connection()

    if conexion is None:
        return None, [], "no se pudo conectar con la base de datos."

    try:
        cursor = conexion.cursor(dictionary=True)

        sql_solicitud = """
            select
                s.id,
                s.direccion_id,
                s.area_id,
                s.cargo_id,
                s.jefe_asignado_id,
                s.maxima_autoridad_id,
                s.codigo_solicitud,
                s.nombres_completos,
                s.cedula,
                s.correo_institucional,
                s.telefono_ext,
                s.dependencia,
                s.area_unidad,
                s.cargo,
                s.fecha_solicitud,
                s.tipo_usuario,
                s.nombre_usuario_externo,
                s.direccion_ip,
                s.tiempo_vigencia_acceso,
                s.justificacion_necesidad_institucional,
                s.estado,
                s.etapa_actual,
                s.bloqueada,
                s.created_at,
                s.updated_at,

                (
                    select concat(p.nombres, ' ', ifnull(p.apellidos, ''))
                    from area_personal p
                    where p.area_id = s.area_id
                      and p.tipo_responsable = 'jefe_area'
                      and p.estado = 'activo'
                    order by p.id asc
                    limit 1
                ) as nombre_jefe_area,

                (
                    select concat(u.nombres, ' ', ifnull(u.apellidos, ''))
                    from usuarios u
                    inner join roles r on r.id = u.rol_id
                    where r.nombre = 'maxima_autoridad'
                      and u.estado = 'activo'
                    order by u.id asc
                    limit 1
                ) as nombre_maxima_autoridad,

                (
                    select concat(u.nombres, ' ', ifnull(u.apellidos, ''))
                    from usuarios u
                    inner join roles r on r.id = u.rol_id
                    where r.nombre = 'analista_tics'
                      and u.estado = 'activo'
                    order by u.id asc
                    limit 1
                ) as nombre_encargado_tics

            from solicitudes s
            where s.id = %s
            limit 1;
        """

        cursor.execute(sql_solicitud, (solicitud_id,))
        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()
            return None, [], "solicitud no encontrada."

        sql_paginas = """
            select
                numero,
                url_pagina,
                descripcion
            from solicitud_paginas_web
            where solicitud_id = %s
            order by numero asc;
        """

        cursor.execute(sql_paginas, (solicitud_id,))
        paginas_web = cursor.fetchall()

        cursor.close()
        conexion.close()

        return solicitud, paginas_web, None

    except Error as error:
        return None, [], str(error)


def texto_seguro(valor):
    if valor is None:
        return ""

    texto = str(valor)
    texto = texto.replace("&", "&amp;")
    texto = texto.replace("<", "&lt;")
    texto = texto.replace(">", "&gt;")
    return texto


def valor_pdf_seguro(solicitud, campo, modo_pdf="electronico", limite=None):
    """
    En modo manual devuelve vacío.
    En modo electrónico devuelve el valor real de la solicitud.
    """

    if modo_pdf == "manual":
        return ""

    if not isinstance(solicitud, dict):
        return ""

    valor = texto_seguro(solicitud.get(campo, ""))

    if limite:
        return valor[:limite]

    return valor


    
    


def estado_legible_pdf(estado):
    estados = {
        "pendiente_firma_solicitante": "Pendiente firma solicitante",
        "pendiente_jefe_inmediato": "Pendiente jefe inmediato",
        "rechazada_jefe_inmediato": "Rechazada jefe inmediato",
        "pendiente_maxima_autoridad": "Pendiente máxima autoridad",
        "rechazada_maxima_autoridad": "Rechazada máxima autoridad",
        "pendiente_tics": "Pendiente validación TICS",
        "rechazada_tics": "Rechazada TICS",
        "pendiente_ejecucion_tics": "Pendiente ejecución TICS",
        "finalizada": "Finalizada",
        "anulada": "Anulada",
        "pendiente_subida_manual": "Pendiente subida manual"
    }

    return estados.get(estado, estado)


def etapa_legible_pdf(etapa):
    etapas = {
        "registro_publico": "Registro público",
        "firma_solicitante": "Firma del solicitante",
        "jefe_inmediato": "Jefe inmediato",
        "maxima_autoridad": "Máxima autoridad",
        "tics": "Validación TICS",
        "ejecucion_tics": "Ejecución TICS",
        "finalizado": "Finalizado",
        "proceso_manual": "Proceso manual"
    }

    return etapas.get(etapa, etapa)


def agregar_titulo_seccion(elementos, titulo, estilos):
    tabla = Table(
        [[Paragraph(f"<b>{titulo}</b>", estilos["section_title"])]],
        colWidths=[17.4 * cm],
        rowHeights=[0.55 * cm]
    )

    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#dbeafe")),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#1e3a8a")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    elementos.append(tabla)

    


def agregar_espacios_firmas(elementos, estilos, solicitud=None, modo_pdf="electronico"):
    agregar_titulo_seccion(
        elementos,
        "5. FIRMAS DE RESPONSABILIDAD Y APROBACIÓN",
        estilos
    )

    solicitud = solicitud or {}

    if modo_pdf == "manual":
        nombre_solicitante = ""
        nombre_jefe = ""
        nombre_autoridad = ""
        nombre_tics = ""
    else:
        nombre_solicitante = texto_seguro(
            solicitud.get("nombres_completos") or ""
        )
        nombre_jefe = texto_seguro(
            solicitud.get("nombre_jefe_area") or "Jefe inmediato"
        )
        nombre_autoridad = texto_seguro(
            solicitud.get("nombre_maxima_autoridad") or "Máxima autoridad institucional"
        )
        nombre_tics = texto_seguro(
            solicitud.get("nombre_encargado_tics") or "Encargado TICS"
        )

    data = [
        [
            Paragraph("<b>SOLICITANTE</b>", estilos["center_bold"]),
            Paragraph("<b>JEFE INMEDIATO</b>", estilos["center_bold"]),
            Paragraph("<b>MÁXIMA AUTORIDAD</b>", estilos["center_bold"]),
            Paragraph("<b>TICS</b>", estilos["center_bold"])
        ],
        [
            Paragraph(
                f"<br/><br/>_________________________<br/><b>{nombre_solicitante}</b>",
                estilos["center"]
            ),
            Paragraph(
                f"<br/><br/>_________________________<br/><b>{nombre_jefe}</b>",
                estilos["center"]
            ),
            Paragraph(
                f"<br/><br/>_________________________<br/><b>{nombre_autoridad}</b>",
                estilos["center"]
            ),
            Paragraph(
                f"<br/><br/>_________________________<br/><b>{nombre_tics}</b>",
                estilos["center"]
            )
        ]
    ]

    tabla = Table(
        data,
        colWidths=[4.35 * cm, 4.35 * cm, 4.35 * cm, 4.35 * cm],
        rowHeights=[1.58 * cm, 2.55 * cm]
    )

    tabla.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eff6ff")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    elementos.append(tabla)
    elementos.append(Spacer(1, 0.22 * cm))


def agregar_seccion_tics_vertical_compacta(elementos, estilos):
    titulo = Table(
        [[
            Paragraph("<b>6</b>", estilos["number_box"]),
            Paragraph(
                "<b>PARA USO EXCLUSIVO DE LA UNIDAD DE TICS</b><br/>"
                "<font size='7'>GESTIÓN DE SEGURIDAD DE TIC'S</font>",
                estilos["center_bold"]
            )
        ]],
        colWidths=[1.2 * cm, 16.2 * cm],
        rowHeights=[0.85 * cm]
    )

    titulo.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    elementos.append(titulo)

    autorizacion = Table(
        [[
            Paragraph("<b>AUTORIZACIÓN:</b>", estilos["mini_bold"]),
            Paragraph("Campo validado por TICS", estilos["mini"]),
            Paragraph("☐ Aprobar", estilos["mini"]),
            Paragraph("☐ Rechazar", estilos["mini"])
        ]],
        colWidths=[3.2 * cm, 6.2 * cm, 4 * cm, 4 * cm],
        rowHeights=[0.70 * cm]
    )

    autorizacion.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f3f4f6")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    elementos.append(autorizacion)

    observacion = Table(
        [[
            Paragraph("<b>OBSERVACIÓN:</b>", estilos["mini_bold"]),
            Paragraph("", estilos["mini"])
        ]],
        colWidths=[3.2 * cm, 14.2 * cm],
        rowHeights=[1.15 * cm]
    )

    observacion.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f3f4f6")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    elementos.append(observacion)

    firmas_tics = Table(
        [[
            Paragraph("Nombre: _______________________<br/><b>Coordinador TICS</b>", estilos["center"]),
            Paragraph("Fecha: _______________________<br/><b>Responsable ejecución</b>", estilos["center"]),
            Paragraph("Nombre: _______________________<br/><b>Admin Firewall INAMHI</b>", estilos["center"])
        ]],
        colWidths=[5.8 * cm, 5.8 * cm, 5.8 * cm],
        rowHeights=[1.45 * cm]
    )

    firmas_tics.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(firmas_tics)

    nota = Paragraph(
        "<b>Nota:</b> Documento de uso institucional. Debe conservarse con las firmas y validaciones correspondientes.",
        estilos["mini"]
    )

    elementos.append(Spacer(1, 0.12 * cm))
    elementos.append(nota)


def generar_pdf_solicitud_a4(solicitud, paginas_web, incluir_seccion_tics=False, modo_pdf="electronico"):
    if isinstance(solicitud, dict):
        modo_pdf = solicitud.get("modo_pdf", modo_pdf)

    buffer = BytesIO()

    documento = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.85 * cm,
        leftMargin=0.85 * cm,
        topMargin=0.75 * cm,
        bottomMargin=0.75 * cm
    )

    styles = getSampleStyleSheet()

    estilos = {
        "title": ParagraphStyle(
            "title",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=14,
            alignment=1,
            textColor=colors.HexColor("#111827")
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=styles["Normal"],
            fontSize=7.5,
            leading=9,
            alignment=1,
            textColor=colors.HexColor("#475569")
        ),
        "section_title": ParagraphStyle(
            "section_title",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            alignment=1,
            textColor=colors.HexColor("#0f172a")
        ),
        "cell_label": ParagraphStyle(
            "cell_label",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=8.5,
            textColor=colors.HexColor("#0f172a")
        ),
        "cell_text": ParagraphStyle(
            "cell_text",
            parent=styles["Normal"],
            fontSize=7,
            leading=8.5,
            textColor=colors.HexColor("#111827")
        ),
        "mini": ParagraphStyle(
            "mini",
            parent=styles["Normal"],
            fontSize=6.4,
            leading=7.4,
            textColor=colors.HexColor("#111827")
        ),
        "mini_bold": ParagraphStyle(
            "mini_bold",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=6.4,
            leading=7.4,
            textColor=colors.HexColor("#111827")
        ),
        "center": ParagraphStyle(
            "center",
            parent=styles["Normal"],
            fontSize=6.7,
            leading=8,
            alignment=1,
            textColor=colors.HexColor("#111827")
        ),
        "center_bold": ParagraphStyle(
            "center_bold",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=6.8,
            leading=8.2,
            alignment=1,
            textColor=colors.HexColor("#111827")
        ),
        "number_box": ParagraphStyle(
            "number_box",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=12,
            alignment=1
        )
    }

    elementos = []

    # =====================================================
    # encabezado con logo
    # =====================================================

    if os.path.exists(LOGO_INAMHI_PATH):
        logo = Image(LOGO_INAMHI_PATH, width=1.8 * cm, height=1.8 * cm)
    else:
        logo = Paragraph("<b>INAMHI</b>", estilos["center_bold"])

    encabezado = Table(
        [[
            logo,
            Paragraph("<b>SOLICITUD DE LIBERACIÓN WEB INSTITUCIONAL</b>", estilos["title"]),
            Paragraph(
                f"<b>Código:</b><br/>{texto_seguro(solicitud['codigo_solicitud'])}",
                estilos["subtitle"]
            )
        ]],
        colWidths=[2.6 * cm, 10.8 * cm, 4.0 * cm],
        rowHeights=[1.9 * cm]
    )

    encabezado.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.9, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eaf2fb")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(encabezado)
    elementos.append(Spacer(1, 0.22 * cm))

    # =====================================================
    # 1. datos del solicitante
    # =====================================================

    agregar_titulo_seccion(elementos, "1. DATOS DEL SOLICITANTE", estilos)

    datos_solicitante = [
    [
        Paragraph("<b>Nombres</b>", estilos["cell_label"]),
        Paragraph(valor_pdf_seguro(solicitud, "nombres_completos", modo_pdf, 90), estilos["cell_text"]),
        Paragraph("<b>Cédula</b>", estilos["cell_label"]),
        Paragraph(valor_pdf_seguro(solicitud, "cedula", modo_pdf), estilos["cell_text"]),
    ],
    [
        Paragraph("<b>Correo</b>", estilos["cell_label"]),
        Paragraph(valor_pdf_seguro(solicitud, "correo_institucional", modo_pdf, 80), estilos["cell_text"]),
        Paragraph("<b>Teléfono</b>", estilos["cell_label"]),
        Paragraph(valor_pdf_seguro(solicitud, "telefono_ext", modo_pdf), estilos["cell_text"]),
    ],
    [
        Paragraph("<b>Dependencia</b>", estilos["cell_label"]),
        Paragraph(valor_pdf_seguro(solicitud, "dependencia", modo_pdf, 80), estilos["cell_text"]),
        Paragraph("<b>Área</b>", estilos["cell_label"]),
        Paragraph(valor_pdf_seguro(solicitud, "area_unidad", modo_pdf, 80), estilos["cell_text"]),
    ],
    [
        Paragraph("<b>Cargo</b>", estilos["cell_label"]),
        Paragraph(valor_pdf_seguro(solicitud, "cargo", modo_pdf, 80), estilos["cell_text"]),
        Paragraph("<b>Fecha</b>", estilos["cell_label"]),
        Paragraph(valor_pdf_seguro(solicitud, "fecha_solicitud", modo_pdf), estilos["cell_text"]),
    ],
]

    tabla_solicitante = Table(
    datos_solicitante,
    colWidths=[2.3 * cm, 6.4 * cm, 2.3 * cm, 6.4 * cm],
    rowHeights=[0.50 * cm, 0.50 * cm, 0.50 * cm, 0.50 * cm]
)

    tabla_solicitante.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
    ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f8fafc")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))

    elementos.append(tabla_solicitante)
    elementos.append(Spacer(1, 0.18 * cm)) 

    # =====================================================
    # 2. información del acceso
    # =====================================================

    agregar_titulo_seccion(elementos, "2. INFORMACIÓN DEL ACCESO SOLICITADO", estilos)

    datos_acceso = [
    [
        Paragraph("<b>Tipo usuario</b>", estilos["cell_label"]),
        Paragraph(valor_pdf_seguro(solicitud, "tipo_usuario", modo_pdf, 70), estilos["cell_text"]),
        Paragraph("<b>Usuario externo</b>", estilos["cell_label"]),
        Paragraph(
            "" if modo_pdf == "manual" else texto_seguro(solicitud.get("nombre_usuario_externo") or "No aplica")[:70],
            estilos["cell_text"]
        ),
    ],
    [
        Paragraph("<b>IP</b>", estilos["cell_label"]),
        Paragraph(
            "" if modo_pdf == "manual" else texto_seguro(solicitud.get("direccion_ip") or "No registrada"),
            estilos["cell_text"]
        ),
        Paragraph("<b>Vigencia</b>", estilos["cell_label"]),
        Paragraph(valor_pdf_seguro(solicitud, "tiempo_vigencia_acceso", modo_pdf, 70), estilos["cell_text"]),
    ],
    [
        Paragraph("<b>Estado</b>", estilos["cell_label"]),
        Paragraph(
            "" if modo_pdf == "manual" else estado_legible_pdf(solicitud.get("estado")),
            estilos["cell_text"]
        ),
        Paragraph("<b>Etapa</b>", estilos["cell_label"]),
        Paragraph(
            "" if modo_pdf == "manual" else etapa_legible_pdf(solicitud.get("etapa_actual")),
            estilos["cell_text"]
        ),
    ],
]


    tabla_acceso = Table(
    datos_acceso,
    colWidths=[2.3 * cm, 6.4 * cm, 2.3 * cm, 6.4 * cm],
    rowHeights=[0.50 * cm, 0.50 * cm, 0.50 * cm]
)

    tabla_acceso.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
    ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f8fafc")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))

    elementos.append(tabla_acceso)
    elementos.append(Spacer(1, 0.18 * cm))

    # =====================================================
    # 3. PÁGINAS WEB SOLICITADAS
    # =====================================================

    agregar_titulo_seccion(
        elementos,
        "3. PÁGINAS WEB SOLICITADAS",
        estilos
    )

    estilo_web_header = ParagraphStyle(
        "estilo_web_header",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9,
        textColor=colors.HexColor("#0f172a"),
        alignment=1
    )

    estilo_web_numero = ParagraphStyle(
        "estilo_web_numero",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9,
        textColor=colors.HexColor("#1d4ed8"),
        alignment=1
    )

    estilo_web_cell = ParagraphStyle(
        "estilo_web_cell",
        fontName="Helvetica",
        fontSize=7.5,
        leading=9,
        textColor=colors.HexColor("#334155"),
        wordWrap="CJK"
    )

    data_paginas = [
        [
            Paragraph("N°", estilo_web_header),
            Paragraph("URL / Página web", estilo_web_header),
            Paragraph("Descripción", estilo_web_header)
        ]
    ]

    if paginas_web:
        for pagina in paginas_web:
            descripcion = pagina.get("descripcion")

            data_paginas.append([
                Paragraph(str(pagina.get("numero") or ""), estilo_web_numero),
                Paragraph(str(pagina.get("url_pagina") or ""), estilo_web_cell),
                Paragraph(str(descripcion or ""), estilo_web_cell)
            ])
    else:
        data_paginas.append([
            Paragraph("-", estilo_web_numero),
            Paragraph("No registra páginas web solicitadas.", estilo_web_cell),
            Paragraph("-", estilo_web_cell)
        ])

    # IMPORTANTE:
    # No usar documento.width aquí porque en tu PDF queda más ancho
    # que las demás tablas. Este ancho mantiene la tabla alineada.
    ancho_tabla_paginas = 500

    tabla_paginas = Table(
        data_paginas,
        colWidths=[
            38,
            285,
            170
        ],
        repeatRows=1,
        hAlign="CENTER"
    )

    tabla_paginas.setStyle(TableStyle([
        # Encabezado
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eaf1ff")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),

        # Cuerpo
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#ffffff")),
        ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#f8fafc")),
        ("VALIGN", (0, 1), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),

        # Bordes
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#64748b")),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#475569")),

        # Espaciado
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(tabla_paginas)
    elementos.append(Spacer(1, 8))

    # =====================================================
    # 4. justificación
    # =====================================================

    agregar_titulo_seccion(elementos, "4. JUSTIFICACIÓN DE LA NECESIDAD INSTITUCIONAL", estilos)

    justificacion = texto_seguro(solicitud["justificacion_necesidad_institucional"])

    if len(justificacion) > 300:
        justificacion = justificacion[:300] + "..."

    tabla_justificacion = Table(
        [[Paragraph(justificacion, estilos["cell_text"])]],
        colWidths=[17.4 * cm],
        rowHeights=[1.25 * cm]
    )

    tabla_justificacion.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))

    elementos.append(tabla_justificacion)
    elementos.append(Spacer(1, 0.22 * cm))

    # =====================================================
    # 5. firmas generales
    # =====================================================

    agregar_espacios_firmas(elementos, estilos, solicitud, modo_pdf)

  # =====================================================
    # 6. sección exclusiva TICS
    # =====================================================

    if incluir_seccion_tics:
        agregar_seccion_tics_vertical_compacta(elementos, estilos)

    documento.build(elementos)

    buffer.seek(0)
    return buffer


@app.route("/api/admin/solicitudes/<int:solicitud_id>/pdf", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def descargar_pdf_solicitud(solicitud_id):
    solicitud, paginas_web, error = obtener_solicitud_completa_para_pdf(solicitud_id)

    if error:
        return jsonify({
            "estado": "error",
            "mensaje": error
        }), 404

    try:
        rol_actual = request.usuario_actual["rol"]
        incluir_seccion_tics = rol_actual == "analista_tics"

        pdf_buffer = generar_pdf_solicitud_a4(
            solicitud,
            paginas_web,
            incluir_seccion_tics=incluir_seccion_tics
        )

        nombre_archivo = f"{solicitud['codigo_solicitud']}.pdf"

        respuesta = send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=nombre_archivo,
            max_age=0
        )

        respuesta.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        respuesta.headers["Pragma"] = "no-cache"
        respuesta.headers["Expires"] = "0"

        return respuesta

    except Exception as error:
        print("ERROR AL GENERAR PDF:", str(error))

        return jsonify({
            "estado": "error",
            "mensaje": "error al generar el PDF.",
            "error": str(error)
        }), 500

# =====================================================
# flujo electrónico público con FirmaEC
# =====================================================

def validar_archivo_pdf(archivo):
    """
    Valida que el archivo recibido sea realmente un PDF.
    Revisa extensión y cabecera interna %PDF-.
    """

    if archivo is None:
        return False, "debe seleccionar un archivo PDF."

    if archivo.filename is None or archivo.filename.strip() == "":
        return False, "el archivo PDF es obligatorio."

    nombre_original = secure_filename(archivo.filename)

    if not nombre_original.lower().endswith(".pdf"):
        return False, "solo se permite subir archivos PDF."

    try:
        inicio_archivo = archivo.stream.read(5)
        archivo.stream.seek(0)

        if inicio_archivo != b"%PDF-":
            return False, "el archivo seleccionado no parece ser un PDF válido."

    except Exception:
        return False, "no se pudo validar el archivo PDF."

    return True, None


def registrar_documento_firmaec_si_existe(solicitud_id, codigo_solicitud, nombre_archivo):
    """
    Registra el PDF firmado en solicitud_documentos si la tabla existe.
    Si la tabla no existe o tiene otra estructura, no rompe el flujo.
    """

    conexion = get_db_connection()

    if conexion is None:
        return False

    try:
        cursor = conexion.cursor()

        cursor.execute("""
            insert into solicitud_documentos (
                solicitud_id,
                etapa,
                rol_firmante,
                usuario_id,
                tipo_documento,
                nombre_archivo,
                ruta_archivo,
                mime_type,
                firmado,
                firma_validada,
                observacion
            ) values (
                %s,
                'firma_solicitante',
                'solicitante',
                null,
                'pdf_firmado_electronico',
                %s,
                %s,
                'application/pdf',
                1,
                0,
                %s
            );
        """, (
            solicitud_id,
            nombre_archivo,
            os.path.join(FIRMADOS_FOLDER, nombre_archivo),
            f"PDF firmado electrónicamente por el solicitante para {codigo_solicitud}."
        ))

        conexion.commit()
        cursor.close()
        conexion.close()

        return True

    except Exception as error:
        print("advertencia: no se pudo registrar en solicitud_documentos:", error)

        try:
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return False


@app.route("/api/public/electronico/preparar", methods=["POST", "OPTIONS"])
def preparar_solicitud_electronica_firmaec():
    """
    Crea la solicitud electrónica en estado inicial,
    guarda las páginas solicitadas y permite descargar el PDF institucional lleno.
    """

    if request.method == "OPTIONS":
        return jsonify({"estado": "ok"}), 200

    data = request.get_json(silent=True) or {}

    if not data:
        return jsonify({
            "estado": "error",
            "mensaje": "no se recibieron datos para preparar la solicitud electrónica."
        }), 400

    errores, datos = validar_solicitud_publica(data)

    if errores:
        return jsonify({
            "estado": "error",
            "mensaje": "existen errores de validación en el formulario.",
            "errores": errores
        }), 400

    direccion_id = data.get("direccion_id")
    area_id = data.get("area_id")
    cargo_id = data.get("cargo_id")

    try:
        direccion_id = int(direccion_id)
        area_id = int(area_id)
        cargo_id = int(cargo_id)
    except Exception:
        return jsonify({
            "estado": "error",
            "mensaje": "debe seleccionar dirección, área y cargo válidos."
        }), 400

    codigo_solicitud = generar_codigo_solicitud()

    if codigo_solicitud is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo generar el código de solicitud."
        }), 500

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        # =====================================================
        # validar dirección, área y cargo
        # =====================================================

        cursor.execute("""
            select id, nombre
            from direcciones
            where id = %s
              and estado = 'activo'
            limit 1;
        """, (direccion_id,))

        direccion = cursor.fetchone()

        if direccion is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "la dirección seleccionada no existe o está inactiva."
            }), 400

        cursor.execute("""
            select id, direccion_id, nombre
            from areas
            where id = %s
              and direccion_id = %s
              and estado = 'activo'
            limit 1;
        """, (area_id, direccion_id))

        area = cursor.fetchone()

        if area is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "el área seleccionada no pertenece a la dirección indicada o está inactiva."
            }), 400

        cursor.execute("""
            select id, area_id, nombre
            from cargos
            where id = %s
              and area_id = %s
              and estado = 'activo'
            limit 1;
        """, (cargo_id, area_id))

        cargo = cursor.fetchone()

        if cargo is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "el cargo seleccionado no pertenece al área indicada o está inactivo."
            }), 400

        # =====================================================
        # obtener jefe asignado del área
        # =====================================================

        cursor.execute("""
            select
                id,
                usuario_id,
                nombres,
                apellidos,
                correo,
                cargo
            from area_personal
            where area_id = %s
              and tipo_responsable = 'jefe_area'
              and estado = 'activo'
            order by id asc
            limit 1;
        """, (area_id,))

        jefe_area = cursor.fetchone()

        if jefe_area is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no existe un jefe configurado para el área seleccionada."
            }), 400

        jefe_asignado_id = jefe_area.get("usuario_id")

        # =====================================================
        # insertar solicitud electrónica
        # =====================================================

        cursor.execute("""
            insert into solicitudes (
                direccion_id,
                area_id,
                cargo_id,
                jefe_asignado_id,
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                telefono_ext,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                nombre_usuario_externo,
                direccion_ip,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada
            ) values (
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s,
                'pendiente_firma_solicitante',
                'firma_solicitante',
                false
            );
        """, (
            direccion_id,
            area_id,
            cargo_id,
            jefe_asignado_id,
            codigo_solicitud,
            datos["nombres_completos"],
            datos["cedula"],
            datos["correo_institucional"],
            datos["telefono_ext"],
            direccion["nombre"],
            area["nombre"],
            cargo["nombre"],
            convertir_fecha(datos["fecha_solicitud"]),
            datos["tipo_usuario"],
            datos["nombre_usuario_externo"],
            datos["direccion_ip"],
            datos["tiempo_vigencia_acceso"],
            datos["justificacion_necesidad_institucional"]
        ))

        solicitud_id = cursor.lastrowid

        # =====================================================
        # insertar páginas web
        # =====================================================

        for index, pagina in enumerate(datos["paginas_web"], start=1):
            cursor.execute("""
                insert into solicitud_paginas_web (
                    solicitud_id,
                    numero,
                    url_pagina,
                    descripcion
                ) values (
                    %s, %s, %s, %s
                );
            """, (
                solicitud_id,
                index,
                pagina["url_pagina"],
                pagina["descripcion"]
            ))

        conexion.commit()

        cursor.close()
        conexion.close()

        try:
            registrar_auditoria(
                usuario_id=None,
                solicitud_id=solicitud_id,
                modulo="firmaec_publico",
                accion="preparar_solicitud_firmaec",
                descripcion=f"Solicitud electrónica preparada para FirmaEC con código {codigo_solicitud}.",
                datos_anteriores=None,
                datos_nuevos={
                    "codigo_solicitud": codigo_solicitud,
                    "direccion_id": direccion_id,
                    "area_id": area_id,
                    "cargo_id": cargo_id,
                    "jefe_asignado_id": jefe_asignado_id,
                    "estado": "pendiente_firma_solicitante",
                    "etapa_actual": "firma_solicitante"
                }
            )
        except Exception as error_auditoria:
            print("advertencia: no se pudo registrar auditoría firmaec:", error_auditoria)

        return jsonify({
            "estado": "ok",
            "mensaje": "formato electrónico generado correctamente.",
            "codigo_solicitud": codigo_solicitud,
            "url_descarga": f"/api/public/electronico/{codigo_solicitud}/pdf",
            "solicitud": {
                "id": solicitud_id,
                "codigo_solicitud": codigo_solicitud,
                "estado": "pendiente_firma_solicitante",
                "etapa_actual": "firma_solicitante",
                "nombres_completos": datos["nombres_completos"],
                "correo_institucional": datos["correo_institucional"],
                "dependencia": direccion["nombre"],
                "area_unidad": area["nombre"],
                "cargo": cargo["nombre"]
            },
            "jefe_area": {
                "id": jefe_area.get("id"),
                "usuario_id": jefe_area.get("usuario_id"),
                "nombres": jefe_area.get("nombres"),
                "apellidos": jefe_area.get("apellidos"),
                "correo": jefe_area.get("correo"),
                "cargo": jefe_area.get("cargo")
            }
        }), 201

    except Error as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        print("ERROR MYSQL AL PREPARAR SOLICITUD ELECTRÓNICA:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error al preparar la solicitud electrónica.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        print("ERROR GENERAL AL PREPARAR SOLICITUD ELECTRÓNICA:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al preparar la solicitud electrónica.",
            "error": str(error)
        }), 500


@app.route("/api/public/electronico/<codigo_solicitud>/subir-firmado", methods=["POST", "OPTIONS"])
def subir_pdf_firmado_firmaec(codigo_solicitud):
    """
    Recibe el PDF firmado electrónicamente por el solicitante.
    Al subirlo correctamente, la solicitud pasa a jefe inmediato.
    """

    if request.method == "OPTIONS":
        return jsonify({"estado": "ok"}), 200

    codigo_solicitud = limpiar_texto(codigo_solicitud).upper()

    if not codigo_solicitud:
        return jsonify({
            "estado": "error",
            "mensaje": "el código de solicitud es obligatorio."
        }), 400

    if not re.match(r"^INAMHI-WEB-\d{4}-\d{4}$", codigo_solicitud):
        return jsonify({
            "estado": "error",
            "mensaje": "el código de solicitud no tiene un formato válido."
        }), 400

    if "archivo" not in request.files:
        return jsonify({
            "estado": "error",
            "mensaje": "debe seleccionar el PDF firmado electrónicamente."
        }), 400

    archivo = request.files["archivo"]

    archivo_valido, mensaje_archivo = validar_archivo_pdf(archivo)

    if not archivo_valido:
        return jsonify({
            "estado": "error",
            "mensaje": mensaje_archivo
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                nombres_completos,
                correo_institucional,
                estado,
                etapa_actual
            from solicitudes
            where codigo_solicitud = %s
            limit 1;
        """, (codigo_solicitud,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró una solicitud con ese código."
            }), 404

        if solicitud["estado"] != "pendiente_firma_solicitante":
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "la solicitud ya no está pendiente de firma del solicitante.",
                "estado_actual": solicitud["estado"],
                "etapa_actual": solicitud["etapa_actual"]
            }), 400

        nombre_archivo = f"pdf_firmado_solicitante_{codigo_solicitud}.pdf"
        ruta_archivo = os.path.join(FIRMADOS_FOLDER, nombre_archivo)

        archivo.save(ruta_archivo)

        cursor.execute("""
            update solicitudes
            set
                estado = 'pendiente_jefe_inmediato',
                etapa_actual = 'jefe_inmediato',
                bloqueada = false
            where codigo_solicitud = %s;
        """, (codigo_solicitud,))

        conexion.commit()

        cursor.close()
        conexion.close()

        registrar_documento_firmaec_si_existe(
            solicitud_id=solicitud["id"],
            codigo_solicitud=codigo_solicitud,
            nombre_archivo=nombre_archivo
        )

        try:
            registrar_auditoria(
                usuario_id=None,
                solicitud_id=solicitud["id"],
                modulo="firmaec_publico",
                accion="subir_pdf_firmado_solicitante",
                descripcion=(
                    f"El solicitante subió el PDF firmado electrónicamente. "
                    f"La solicitud {codigo_solicitud} fue enviada al jefe inmediato."
                ),
                datos_anteriores={
                    "estado": solicitud["estado"],
                    "etapa_actual": solicitud["etapa_actual"]
                },
                datos_nuevos={
                    "estado": "pendiente_jefe_inmediato",
                    "etapa_actual": "jefe_inmediato",
                    "archivo": nombre_archivo
                }
            )
        except Exception as error_auditoria:
            print("advertencia: no se pudo registrar auditoría de PDF firmado:", error_auditoria)

        return jsonify({
            "estado": "ok",
            "mensaje": "PDF firmado subido correctamente. La solicitud fue enviada al jefe inmediato.",
            "solicitud": {
                "id": solicitud["id"],
                "codigo_solicitud": codigo_solicitud,
                "estado": "pendiente_jefe_inmediato",
                "etapa_actual": "jefe_inmediato",
                "archivo_firmado": nombre_archivo
            }
        }), 200

    except Error as error:
        conexion.rollback()

        print("error al subir pdf firmado:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error al subir el PDF firmado.",
            "error": str(error)
        }), 500

    except Exception as error:
        conexion.rollback()

        print("error inesperado al subir pdf firmado:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al subir el PDF firmado.",
            "error": str(error)
        }), 500
# =====================================================
# flujo manual público
# =====================================================

def generar_uuid_manual():
    return f"MAN-{uuid.uuid4().hex[:8].upper()}"


def generar_pdf_manual_vacio(uuid_solicitud, nombres, apellidos, correo):
    """
    Genera el PDF manual usando el MISMO FORMATO institucional
    que ya utiliza el sistema en generar_pdf_solicitud_a4().
    No crea un formato nuevo.
    """

    fecha_actual = datetime.datetime.now().date()

    solicitud_manual = {
        "id": None,
        "codigo_solicitud": uuid_solicitud,

        "nombres_completos": f"{nombres} {apellidos}",
        "correo_institucional": correo,

        "cedula": "",
        "telefono_ext": "",
        "dependencia": "",
        "area_unidad": "",
        "cargo": "",
        "fecha_solicitud": fecha_actual,

        "tipo_usuario": "",
        "nombre_usuario_externo": "",
        "direccion_ip": "",
        "tiempo_vigencia_acceso": "",

        "justificacion_necesidad_institucional": (
            " "
            " "
            " "
            ""
        ),

        "estado": "pendiente_subida_manual",
        "etapa_actual": "proceso_manual",

        "bloqueada": False,
        "created_at": datetime.datetime.now(),
        "updated_at": datetime.datetime.now()
    }

    paginas_manual = [
        {
            "numero": 1,
            "url_pagina": "",
            "descripcion": ""
        },
        {
            "numero": 2,
            "url_pagina": "",
            "descripcion": ""
        },
        {
            "numero": 3,
            "url_pagina": "",
            "descripcion": ""
        },
        {
            "numero": 4,
            "url_pagina": "",
            "descripcion": ""
        }
    ]
    solicitud_manual["modo_pdf"] = "manual"

    return generar_pdf_solicitud_a4(
        solicitud_manual,
        paginas_manual,
        incluir_seccion_tics=False
        
    )


@app.route("/api/manual/registrar", methods=["POST", "OPTIONS"])
def registrar_solicitud_manual():
    if request.method == "OPTIONS":
        return jsonify({"estado": "ok"}), 200

    data = request.get_json()

    if not data:
        return jsonify({
            "estado": "error",
            "mensaje": "no se recibieron datos para registrar la solicitud manual."
        }), 400

    nombres = normalizar_espacios(data.get("nombres"))
    apellidos = normalizar_espacios(data.get("apellidos"))
    correo = limpiar_texto(data.get("correo")).lower()

    errores = {}

    if not nombres:
        errores["nombres"] = "el nombre es obligatorio."
    elif len(nombres) < 2:
        errores["nombres"] = "el nombre debe tener mínimo 2 caracteres."
    elif not validar_solo_letras_espacios(nombres):
        errores["nombres"] = "el nombre solo puede contener letras y espacios."

    if not apellidos:
        errores["apellidos"] = "el apellido es obligatorio."
    elif len(apellidos) < 2:
        errores["apellidos"] = "el apellido debe tener mínimo 2 caracteres."
    elif not validar_solo_letras_espacios(apellidos):
        errores["apellidos"] = "el apellido solo puede contener letras y espacios."

    if not correo:
        errores["correo"] = "el correo electrónico es obligatorio."
    elif not validar_correo_general(correo):
        errores["correo"] = "ingrese un correo electrónico válido."

    if errores:
        return jsonify({
            "estado": "error",
            "mensaje": "existen errores de validación en el formulario manual.",
            "errores": errores
        }), 400

    uuid_solicitud = generar_uuid_manual()
    fecha_hora = datetime.datetime.now()
    fecha_registro = fecha_hora.date()
    hora_registro = fecha_hora.time().replace(microsecond=0)

    nombre_pdf = f"documento_manual_vacio_{uuid_solicitud}.pdf"
    ruta_pdf = os.path.join(DOCUMENTOS_FOLDER, nombre_pdf)

    try:
        pdf_buffer = generar_pdf_manual_vacio(
            uuid_solicitud=uuid_solicitud,
            nombres=nombres,
            apellidos=apellidos,
            correo=correo
        )

        with open(ruta_pdf, "wb") as archivo_pdf:
            archivo_pdf.write(pdf_buffer.getvalue())

    except Exception as error:
        print("error al generar pdf manual:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo generar el documento PDF manual.",
            "error": str(error)
        }), 500

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor()

        cursor.execute("""
            insert into solicitudes_manual (
                uuid_solicitud,
                nombres,
                apellidos,
                correo,
                estado,
                documento_vacio,
                documento_escaneado,
                fecha_registro,
                hora_registro
            ) values (
                %s, %s, %s, %s,
                'PENDIENTE_SUBIDA',
                %s,
                null,
                %s,
                %s
            );
        """, (
            uuid_solicitud,
            nombres,
            apellidos,
            correo,
            nombre_pdf,
            fecha_registro,
            hora_registro
        ))

        conexion.commit()
        solicitud_manual_id = cursor.lastrowid

        cursor.close()
        conexion.close()

        try:
            registrar_auditoria(
                usuario_id=None,
                solicitud_id=None,
                modulo="flujo_manual",
                accion="registrar_descarga_manual",
                descripcion=(
                    f"Solicitud manual descargada por: {nombres} {apellidos} "
                    f"con correo {correo} el {fecha_registro} a las {hora_registro}."
                ),
                datos_anteriores=None,
                datos_nuevos={
                    "solicitud_manual_id": solicitud_manual_id,
                    "uuid_solicitud": uuid_solicitud,
                    "nombres": nombres,
                    "apellidos": apellidos,
                    "correo": correo,
                    "estado": "PENDIENTE_SUBIDA",
                    "documento_vacio": nombre_pdf
                }
            )
        except Exception as error_auditoria:
            print("advertencia: no se pudo registrar auditoría manual:", error_auditoria)

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitud manual registrada correctamente.",
            "uuid_solicitud": uuid_solicitud,
            "fecha": str(fecha_registro),
            "hora": str(hora_registro),
            "url_descarga": f"/api/manual/{uuid_solicitud}/descargar",
            "solicitud": {
                "id": solicitud_manual_id,
                "uuid_solicitud": uuid_solicitud,
                "nombres": nombres,
                "apellidos": apellidos,
                "correo": correo,
                "estado": "PENDIENTE_SUBIDA"
            }
        }), 201

    except Error as error:
        conexion.rollback()

        print("error al registrar solicitud manual:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error al registrar la solicitud manual.",
            "error": str(error)
        }), 500

# =====================================================
# validar solicitud manual por ID
# =====================================================

@app.route("/api/manual/validar/<uuid_solicitud>", methods=["GET"])
def validar_solicitud_manual(uuid_solicitud):
    uuid_solicitud = limpiar_texto(uuid_solicitud).upper()

    if not uuid_solicitud:
        return jsonify({
            "estado": "error",
            "mensaje": "el ID de solicitud manual es obligatorio."
        }), 400

    if not re.match(r"^MAN-[A-Z0-9]{8}$", uuid_solicitud):
        return jsonify({
            "estado": "error",
            "mensaje": "el ID manual no tiene un formato válido. ejemplo: MAN-65CA1D9A."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                uuid_solicitud,
                nombres,
                apellidos,
                correo,
                estado,
                documento_vacio,
                documento_escaneado,
                fecha_registro,
                hora_registro,
                created_at,
                updated_at
            from solicitudes_manual
            where uuid_solicitud = %s
            limit 1;
        """, (uuid_solicitud,))

        solicitud = cursor.fetchone()

        cursor.close()
        conexion.close()

        if solicitud is None:
            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró una solicitud manual con ese ID."
            }), 404

        habilitar_subida = solicitud["estado"] != "FINALIZADO"

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitud manual encontrada correctamente.",
            "habilitar_subida": habilitar_subida,
            "solicitud": {
                "id": solicitud["id"],
                "uuid_solicitud": solicitud["uuid_solicitud"],
                "nombres": solicitud["nombres"],
                "apellidos": solicitud["apellidos"],
                "correo": solicitud["correo"],
                "estado": solicitud["estado"],
                "documento_vacio": solicitud["documento_vacio"],
                "documento_escaneado": solicitud["documento_escaneado"],
                "fecha_registro": str(solicitud["fecha_registro"]) if solicitud["fecha_registro"] else None,
                "hora_registro": str(solicitud["hora_registro"]) if solicitud["hora_registro"] else None,
                "created_at": serializar_fecha(solicitud["created_at"]),
                "updated_at": serializar_fecha(solicitud["updated_at"])
            }
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al validar la solicitud manual.",
            "error": str(error)
        }), 500


# =====================================================
# correo de activación para proceso manual
# =====================================================

def enviar_correo_activacion_manual(nombres, apellidos, correo, uuid_solicitud):
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASSWORD:
        print("configuración SMTP incompleta. No se envió el correo de activación manual.")
        return False

    correo_destino = limpiar_texto(correo).lower()
    if not correo_destino:
        print("no existe correo destinatario para activación manual.")
        return False

    nombre_completo = f"{nombres} {apellidos}".strip()
    fecha_actual = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
    anio_actual = datetime.datetime.now().year

    nombre_seguro = html.escape(nombre_completo)
    uuid_seguro = html.escape(uuid_solicitud)
    fecha_segura = html.escape(fecha_actual)

    asunto = f"✅ Solicitud Manual Recibida - {uuid_solicitud}"

    cuerpo_texto = f"""
Estimado/a {nombre_completo},

Hemos recibido su documento firmado para el proceso de Liberación Web INAMHI.

ID de proceso: {uuid_solicitud}
Fecha de recepción: {fecha_actual}

Su solicitud ha sido registrada y está siendo procesada por el área de Tecnologías de la Información.
Una vez que el acceso haya sido configurado, recibirá una notificación adicional.

Atentamente,
Sistema de Gestión de Solicitudes de Liberación Web - INAMHI
"""

    cuerpo_html = f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.10);">

          <!-- ENCABEZADO -->
          <tr>
            <td style="background:linear-gradient(135deg,#0369a1 0%,#0c4a6e 100%);padding:36px 40px;text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="background:rgba(255,255,255,0.15);display:inline-block;border-radius:50%;padding:16px;margin-bottom:16px;">
                      <span style="font-size:36px;">📋</span>
                    </div>
                    <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:0.5px;">Documento Recibido</h1>
                    <p style="color:#bae6fd;margin:8px 0 0;font-size:14px;font-weight:400;">Sistema de Liberación Web · INAMHI</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BADGE DE ESTADO -->
          <tr>
            <td align="center" style="padding:24px 40px 0;">
              <span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:700;padding:8px 22px;border-radius:50px;letter-spacing:0.5px;border:1px solid #bbf7d0;">
                ✅ &nbsp; DOCUMENTO RECIBIDO CORRECTAMENTE
              </span>
            </td>
          </tr>

          <!-- SALUDO -->
          <tr>
            <td style="padding:28px 40px 0;color:#1e293b;">
              <p style="font-size:17px;margin:0 0 12px;">Estimado/a <strong style="color:#0369a1;">{nombre_seguro}</strong>,</p>
              <p style="font-size:15px;line-height:1.7;color:#475569;margin:0;">
                Hemos recibido su documento firmado para el proceso de solicitud de acceso a la red institucional.
                Su trámite ha sido registrado exitosamente y está siendo procesado por el área de
                <strong>Tecnologías de la Información y Comunicación (TICS)</strong>.
              </p>
            </td>
          </tr>

          <!-- DETALLES DEL PROCESO -->
          <tr>
            <td style="padding:28px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
                <tr style="background:#f8fafc;">
                  <td style="padding:14px 18px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #e2e8f0;" colspan="2">
                    Detalles del proceso
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;font-size:14px;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;width:45%;">ID de proceso</td>
                  <td style="padding:14px 18px;font-size:14px;color:#0f172a;font-family:monospace;font-weight:700;border-bottom:1px solid #f1f5f9;">{uuid_seguro}</td>
                </tr>
                <tr style="background:#fafafa;">
                  <td style="padding:14px 18px;font-size:14px;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Solicitante</td>
                  <td style="padding:14px 18px;font-size:14px;color:#0f172a;font-weight:600;border-bottom:1px solid #f1f5f9;">{nombre_seguro}</td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;font-size:14px;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Tipo de proceso</td>
                  <td style="padding:14px 18px;font-size:14px;color:#0f172a;border-bottom:1px solid #f1f5f9;">Solicitud Manual</td>
                </tr>
                <tr style="background:#fafafa;">
                  <td style="padding:14px 18px;font-size:14px;color:#64748b;font-weight:600;">Fecha de recepción</td>
                  <td style="padding:14px 18px;font-size:14px;color:#0f172a;">{fecha_segura}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CAJA INFORMATIVA -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 12px 12px 0;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1d4ed8;">ℹ️ &nbsp;¿Qué sigue ahora?</p>
                    <p style="margin:0;font-size:14px;line-height:1.7;color:#1e40af;">
                      El equipo de TICS revisará su documento y procederá con la configuración de acceso a la red.
                      Este proceso puede tardar hasta <strong>24 horas hábiles</strong>. En caso de alguna
                      observación, nos contactaremos con usted a través de este correo electrónico.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FIRMA -->
          <tr>
            <td style="padding:28px 40px 32px;">
              <p style="margin:0 0 4px;font-size:14px;color:#64748b;">Atentamente,</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">Sistema de Gestión de Solicitudes de Liberación Web</p>
              <p style="margin:4px 0 0;font-size:14px;color:#0369a1;font-weight:600;">Instituto Nacional de Meteorología e Hidrología · INAMHI</p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                &copy; {anio_actual} Instituto Nacional de Meteorología e Hidrología &mdash; Ecuador
                <br>Este es un mensaje automático, por favor no responda a este correo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    try:
        enviar_correo(
            destinatario=correo_destino,
            asunto=asunto,
            cuerpo=cuerpo_texto,
            cuerpo_html=cuerpo_html
        )
        print(f"correo de activación manual enviado a {correo_destino}")
        return True
    except Exception as error:
        print("error al enviar correo de activación manual:", error)
        return False


# =====================================================
# subir documento manual firmado y finalizar proceso
# =====================================================

@app.route("/api/manual/<uuid_solicitud>/subir", methods=["POST", "OPTIONS"])
def subir_documento_manual_firmado(uuid_solicitud):
    if request.method == "OPTIONS":
        return jsonify({"estado": "ok"}), 200

    uuid_solicitud = limpiar_texto(uuid_solicitud).upper()

    if not uuid_solicitud:
        return jsonify({
            "estado": "error",
            "mensaje": "el ID de solicitud manual es obligatorio."
        }), 400

    if not re.match(r"^MAN-[A-Z0-9]{8}$", uuid_solicitud):
        return jsonify({
            "estado": "error",
            "mensaje": "el ID manual no tiene un formato válido. ejemplo: MAN-65CA1D9A."
        }), 400

    if "archivo" not in request.files:
        return jsonify({
            "estado": "error",
            "mensaje": "debe seleccionar un documento PDF."
        }), 400

    archivo = request.files["archivo"]

    if archivo.filename is None or archivo.filename.strip() == "":
        return jsonify({
            "estado": "error",
            "mensaje": "el archivo PDF es obligatorio."
        }), 400

    nombre_original = secure_filename(archivo.filename)

    if not nombre_original.lower().endswith(".pdf"):
        return jsonify({
            "estado": "error",
            "mensaje": "solo se permite subir archivos PDF."
        }), 400

    # Validación básica de firma PDF: el archivo debe iniciar con %PDF-
    try:
        inicio_archivo = archivo.stream.read(5)
        archivo.stream.seek(0)

        if inicio_archivo != b"%PDF-":
            return jsonify({
                "estado": "error",
                "mensaje": "el archivo seleccionado no parece ser un PDF válido."
            }), 400

    except Exception:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo validar el archivo PDF."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                uuid_solicitud,
                nombres,
                apellidos,
                correo,
                estado,
                documento_escaneado
            from solicitudes_manual
            where uuid_solicitud = %s
            limit 1;
        """, (uuid_solicitud,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró una solicitud manual con ese ID."
            }), 404

        if solicitud["estado"] == "FINALIZADO":
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "esta solicitud manual ya fue finalizada anteriormente."
            }), 400

        nombre_archivo_final = f"documento_manual_firmado_{uuid_solicitud}.pdf"
        ruta_archivo_final = os.path.join(ESCANEADOS_FOLDER, nombre_archivo_final)

        archivo.save(ruta_archivo_final)

        cursor.execute("""
            update solicitudes_manual
            set
                documento_escaneado = %s,
                estado = 'FINALIZADO'
            where uuid_solicitud = %s;
        """, (
            nombre_archivo_final,
            uuid_solicitud
        ))

        conexion.commit()

        cursor.close()
        conexion.close()

        try:
            registrar_auditoria(
                usuario_id=None,
                solicitud_id=None,
                modulo="flujo_manual",
                accion="subir_documento_manual_finalizado",
                descripcion=(
                    f"El usuario subió el documento manual firmado para la solicitud {uuid_solicitud}. "
                    f"El proceso manual quedó FINALIZADO."
                ),
                datos_anteriores={
                    "uuid_solicitud": uuid_solicitud,
                    "estado": solicitud["estado"],
                    "documento_escaneado": solicitud["documento_escaneado"]
                },
                datos_nuevos={
                    "uuid_solicitud": uuid_solicitud,
                    "estado": "FINALIZADO",
                    "documento_escaneado": nombre_archivo_final
                }
            )
        except Exception as error_auditoria:
            print("advertencia: no se pudo registrar auditoría de subida manual:", error_auditoria)

        # enviar correo de activación automático al correo registrado en el formulario manual
        correo_enviado = False
        try:
            correo_enviado = enviar_correo_activacion_manual(
                nombres=solicitud["nombres"],
                apellidos=solicitud["apellidos"],
                correo=solicitud["correo"],
                uuid_solicitud=uuid_solicitud
            )
        except Exception as error_correo:
            print("advertencia: no se pudo enviar correo de activación manual:", error_correo)

        return jsonify({
            "estado": "ok",
            "mensaje": "documento manual subido correctamente. el proceso manual quedó finalizado.",
            "correo_enviado": correo_enviado,
            "solicitud": {
                "uuid_solicitud": uuid_solicitud,
                "estado": "FINALIZADO",
                "documento_escaneado": nombre_archivo_final
            }
        }), 200

    except Error as error:
        conexion.rollback()

        return jsonify({
            "estado": "error",
            "mensaje": "error al subir el documento manual.",
            "error": str(error)
        }), 500

    except Exception as error:
        conexion.rollback()

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al guardar el documento manual.",
            "error": str(error)
        }), 500




@app.route("/api/manual/<uuid_solicitud>/descargar", methods=["GET"])
def descargar_documento_manual_vacio(uuid_solicitud):
    uuid_solicitud = limpiar_texto(uuid_solicitud).upper()

    if not uuid_solicitud:
        return jsonify({
            "estado": "error",
            "mensaje": "el ID de solicitud es obligatorio."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                uuid_solicitud,
                documento_vacio
            from solicitudes_manual
            where uuid_solicitud = %s
            limit 1;
        """, (uuid_solicitud,))

        solicitud = cursor.fetchone()

        cursor.close()
        conexion.close()

        if solicitud is None:
            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró una solicitud manual con ese ID."
            }), 404

        if not solicitud["documento_vacio"]:
            return jsonify({
                "estado": "error",
                "mensaje": "la solicitud no tiene documento generado."
            }), 404

        ruta_pdf = os.path.join(DOCUMENTOS_FOLDER, solicitud["documento_vacio"])

        if not os.path.exists(ruta_pdf):
            return jsonify({
                "estado": "error",
                "mensaje": "el archivo PDF no existe en el servidor."
            }), 404

        return send_file(
            ruta_pdf,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"documento_manual_{uuid_solicitud}.pdf",
            max_age=0
        )

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al descargar el documento manual.",
            "error": str(error)
        }), 500


# =====================================================
# procesos manuales - administrador
# =====================================================

@app.route("/api/admin/manuales", methods=["GET"])
@token_requerido
@roles_permitidos("administrador")
def listar_procesos_manuales_admin():
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                uuid_solicitud,
                nombres,
                apellidos,
                correo,
                estado,
                documento_vacio,
                documento_escaneado,
                fecha_registro,
                hora_registro,
                created_at,
                case
                    when documento_escaneado is not null
                         and documento_escaneado <> ''
                    then true
                    else false
                end as tiene_documento_firmado
            from solicitudes_manual
            order by id desc;
        """)

        solicitudes = cursor.fetchall()

        for item in solicitudes:
            item["tiene_documento_firmado"] = bool(item["tiene_documento_firmado"])
            item["fecha_registro"] = serializar_fecha(item.get("fecha_registro"))
            item["created_at"] = serializar_fecha(item.get("created_at"))

            if item.get("hora_registro"):
                item["hora_registro"] = str(item["hora_registro"])

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "procesos manuales obtenidos correctamente.",
            "total": len(solicitudes),
            "solicitudes": solicitudes
        }), 200

    except Error as error:
        print("ERROR AL LISTAR PROCESOS MANUALES:", error)

        try:
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener los procesos manuales.",
            "error": str(error)
        }), 500


@app.route("/api/admin/manuales/<uuid_solicitud>/descargar-firmado", methods=["GET"])
@token_requerido
@roles_permitidos("administrador")
def descargar_documento_manual_firmado_admin(uuid_solicitud):
    uuid_solicitud = limpiar_texto(uuid_solicitud).upper()

    if not uuid_solicitud:
        return jsonify({
            "estado": "error",
            "mensaje": "el ID de solicitud manual es obligatorio."
        }), 400

    if not re.match(r"^MAN-[A-Z0-9]{8}$", uuid_solicitud):
        return jsonify({
            "estado": "error",
            "mensaje": "el ID manual no tiene un formato válido. ejemplo: MAN-65CA1D9A."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                uuid_solicitud,
                nombres,
                apellidos,
                correo,
                estado,
                documento_escaneado
            from solicitudes_manual
            where uuid_solicitud = %s
            limit 1;
        """, (uuid_solicitud,))

        solicitud = cursor.fetchone()

        cursor.close()
        conexion.close()

        if solicitud is None:
            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró una solicitud manual con ese ID."
            }), 404

        if solicitud["estado"] != "FINALIZADO":
            return jsonify({
                "estado": "error",
                "mensaje": "la solicitud manual aún no está finalizada."
            }), 400

        if not solicitud["documento_escaneado"]:
            return jsonify({
                "estado": "error",
                "mensaje": "la solicitud manual no tiene documento firmado subido."
            }), 404

        ruta_archivo = os.path.join(ESCANEADOS_FOLDER, solicitud["documento_escaneado"])

        if not os.path.exists(ruta_archivo):
            return jsonify({
                "estado": "error",
                "mensaje": "el archivo firmado no existe en el servidor."
            }), 404

        try:
            registrar_auditoria(
                usuario_id=request.usuario_actual["id"],
                solicitud_id=None,
                modulo="flujo_manual",
                accion="descargar_documento_manual_firmado",
                descripcion=(
                    f"El usuario {request.usuario_actual['usuario']} descargó el documento manual firmado "
                    f"de la solicitud {uuid_solicitud}."
                ),
                datos_anteriores=None,
                datos_nuevos={
                    "uuid_solicitud": uuid_solicitud,
                    "documento_escaneado": solicitud["documento_escaneado"]
                }
            )
        except Exception as error_auditoria:
            print("advertencia: no se pudo registrar auditoría de descarga manual:", error_auditoria)

        return send_file(
            ruta_archivo,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"documento_manual_firmado_{uuid_solicitud}.pdf",
            max_age=0
        )

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al descargar el documento manual firmado.",
            "error": str(error)
        }), 500


# =====================================================
# procesos electrónicos - administrador revisor
# =====================================================

@app.route("/api/admin/procesos-electronicos", methods=["GET"])
@token_requerido
@roles_permitidos("administrador")
def listar_procesos_electronicos_admin():
    busqueda = limpiar_texto(request.args.get("q"))
    estado = limpiar_texto(request.args.get("estado"))
    etapa = limpiar_texto(request.args.get("etapa"))

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        condiciones = []
        parametros = []

        if busqueda:
            condiciones.append("""
                (
                    s.codigo_solicitud like %s or
                    s.nombres_completos like %s or
                    s.cedula like %s or
                    s.correo_institucional like %s or
                    s.dependencia like %s or
                    s.area_unidad like %s or
                    s.cargo like %s
                )
            """)

            valor_busqueda = f"%{busqueda}%"

            parametros.extend([
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda
            ])

        if estado:
            condiciones.append("s.estado = %s")
            parametros.append(estado)

        if etapa:
            condiciones.append("s.etapa_actual = %s")
            parametros.append(etapa)

        where_sql = ""

        if condiciones:
            where_sql = "where " + " and ".join(condiciones)

        sql = f"""
            select
                s.id,
                s.codigo_solicitud,
                s.nombres_completos,
                s.cedula,
                s.correo_institucional,
                s.telefono_ext,
                s.dependencia,
                s.area_unidad,
                s.cargo,
                s.fecha_solicitud,
                s.tipo_usuario,
                s.nombre_usuario_externo,
                s.direccion_ip,
                s.tiempo_vigencia_acceso,
                s.justificacion_necesidad_institucional,
                s.estado,
                s.etapa_actual,
                s.bloqueada,
                s.created_at,
                s.updated_at,

                (
                    select count(*)
                    from solicitud_documentos d
                    where d.solicitud_id = s.id
                ) as total_documentos,

                (
                    select d.nombre_archivo
                    from solicitud_documentos d
                    where d.solicitud_id = s.id
                    order by d.id desc
                    limit 1
                ) as ultimo_documento

            from solicitudes s
            {where_sql}
            order by s.id desc;
        """

        cursor.execute(sql, tuple(parametros))
        solicitudes = cursor.fetchall()

        for item in solicitudes:
            item["fecha_solicitud"] = str(item["fecha_solicitud"]) if item["fecha_solicitud"] else None
            item["created_at"] = serializar_fecha(item["created_at"])
            item["updated_at"] = serializar_fecha(item["updated_at"])
            item["bloqueada"] = bool(item["bloqueada"]) if item["bloqueada"] is not None else False
            item["total_documentos"] = int(item["total_documentos"] or 0)

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "procesos electrónicos obtenidos correctamente.",
            "total": len(solicitudes),
            "solicitudes": solicitudes
        }), 200

    except Error as error:
        print("error al obtener procesos electrónicos:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener los procesos electrónicos.",
            "error": str(error)
        }), 500


@app.route("/api/admin/procesos-electronicos/<codigo_solicitud>/pdf-actual", methods=["GET"])
@token_requerido
@roles_permitidos("administrador")
def descargar_pdf_actual_proceso_electronico_admin(codigo_solicitud):
    codigo_solicitud = limpiar_texto(codigo_solicitud).upper()

    if not codigo_solicitud:
        return jsonify({
            "estado": "error",
            "mensaje": "el código de solicitud es obligatorio."
        }), 400

    if not re.match(r"^INAMHI-WEB-\d{4}-\d{4}$", codigo_solicitud):
        return jsonify({
            "estado": "error",
            "mensaje": "el código de solicitud no tiene un formato válido."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                telefono_ext,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                nombre_usuario_externo,
                direccion_ip,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada,
                created_at,
                updated_at
            from solicitudes
            where codigo_solicitud = %s
            limit 1;
        """, (codigo_solicitud,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró una solicitud electrónica con ese código."
            }), 404

        # Buscar el último PDF subido en solicitud_documentos.
        cursor.execute("""
            select
                id,
                nombre_archivo,
                ruta_archivo,
                tipo_documento,
                etapa,
                rol_firmante,
                created_at
            from solicitud_documentos
            where solicitud_id = %s
              and nombre_archivo is not null
            order by id desc
            limit 1;
        """, (solicitud["id"],))

        documento = cursor.fetchone()

        cursor.close()
        conexion.close()

        # Si existe un documento subido, se descarga ese.
        if documento:
            ruta_archivo = documento.get("ruta_archivo")

            if ruta_archivo and os.path.exists(ruta_archivo):
                return send_file(
                    ruta_archivo,
                    mimetype="application/pdf",
                    as_attachment=True,
                    download_name=f"documento_actual_{codigo_solicitud}.pdf",
                    max_age=0
                )

            # Si en la BD solo está el nombre, buscamos en carpetas conocidas.
            nombre_archivo = documento.get("nombre_archivo")

            posibles_rutas = [
                os.path.join(FIRMADOS_FOLDER, nombre_archivo),
                os.path.join(DOCUMENTOS_FOLDER, nombre_archivo),
                os.path.join(ESCANEADOS_FOLDER, nombre_archivo)
            ]

            for ruta in posibles_rutas:
                if ruta and os.path.exists(ruta):
                    return send_file(
                        ruta,
                        mimetype="application/pdf",
                        as_attachment=True,
                        download_name=f"documento_actual_{codigo_solicitud}.pdf",
                        max_age=0
                    )

        # Si no hay PDF firmado/subido, generamos el formato actual desde la solicitud.
        conexion = get_db_connection()

        if conexion is None:
            return jsonify({
                "estado": "error",
                "mensaje": "no se pudo conectar con la base de datos."
            }), 500

        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                numero,
                url_pagina,
                descripcion
            from solicitud_paginas_web
            where solicitud_id = %s
            order by numero asc;
        """, (solicitud["id"],))

        paginas_web = cursor.fetchall()

        cursor.close()
        conexion.close()

        pdf_buffer = generar_pdf_solicitud_a4(
            solicitud,
            paginas_web,
            incluir_seccion_tics=False
        )

        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"formato_{codigo_solicitud}.pdf",
            max_age=0
        )

    except Error as error:
        print("error al descargar pdf actual electrónico:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error al descargar el PDF actual del proceso electrónico.",
            "error": str(error)
        }), 500

    except Exception as error:
        print("error inesperado al descargar pdf actual electrónico:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al descargar el PDF actual del proceso electrónico.",
            "error": str(error)
        }), 500
# =====================================================
# detalle administrativo de solicitud
# =====================================================

@app.route("/api/admin/solicitudes/<int:solicitud_id>", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "analista_tics", "jefe_inmediato", "maxima_autoridad")
def obtener_solicitud_admin(solicitud_id):
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        # =====================================================
        # obtener datos principales de la solicitud
        # =====================================================

        sql_solicitud = """
            select
                id,
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                telefono_ext,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                nombre_usuario_externo,
                direccion_ip,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada,
                created_at,
                updated_at
            from solicitudes
            where id = %s
            limit 1;
        """

        cursor.execute(sql_solicitud, (solicitud_id,))
        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "solicitud no encontrada."
            }), 404

        solicitud["fecha_solicitud"] = serializar_fecha(solicitud["fecha_solicitud"])
        solicitud["created_at"] = serializar_fecha(solicitud["created_at"])
        solicitud["updated_at"] = serializar_fecha(solicitud["updated_at"])

        # =====================================================
        # obtener páginas web solicitadas
        # =====================================================

        sql_paginas = """
            select
                id,
                numero,
                url_pagina,
                descripcion
            from solicitud_paginas_web
            where solicitud_id = %s
            order by numero asc;
        """

        cursor.execute(sql_paginas, (solicitud_id,))
        paginas_web = cursor.fetchall()

        # =====================================================
        # obtener documentos cargados de la solicitud
        # =====================================================

        sql_documentos = """
            select
                id,
                solicitud_id,
                etapa,
                rol_firmante,
                usuario_id,
                tipo_documento,
                nombre_archivo,
                ruta_archivo,
                mime_type,
                firmado,
                firma_validada,
                observacion,
                created_at,
                updated_at
            from solicitud_documentos
            where solicitud_id = %s
            order by id desc;
        """

        cursor.execute(sql_documentos, (solicitud_id,))
        documentos = cursor.fetchall()

        for documento in documentos:
            documento["created_at"] = serializar_fecha(documento["created_at"])
            documento["updated_at"] = serializar_fecha(documento["updated_at"])

        # =====================================================
        # verificar si existe documento firmado cargado
        # =====================================================

        documento_firmado_cargado = any(
            documento["firmado"] == 1 or
            documento["firmado"] is True or
            documento["firma_validada"] == 1 or
            documento["firma_validada"] is True or
            documento["tipo_documento"] in [
                "pdf_firmado_manual",
                "pdf_firmado_electronico",
                "pdf_tics",
                "pdf_final"
            ]
            for documento in documentos
        )

        documento_actual = documentos[0] if documentos else None

        if documento_actual:
            solicitud["documento_actual_id"] = documento_actual["id"]
            solicitud["firma_actual_validada"] = documento_actual["firma_validada"]
        else:
            solicitud["documento_actual_id"] = None
            solicitud["firma_actual_validada"] = False

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "solicitud": solicitud,
            "paginas_web": paginas_web,
            "documentos": documentos,
            "documento_firmado_cargado": documento_firmado_cargado
        }), 200

    except Error as error:
        try:
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener la solicitud.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al obtener la solicitud.",
            "error": str(error)
        }), 500


# =====================================================
# flujo administrativo de aprobación / rechazo
# =====================================================

def obtener_siguiente_estado_por_rol(estado_actual, rol_actual):
    reglas = {
        ("pendiente_jefe_inmediato", "jefe_inmediato"): {
            "nuevo_estado": "pendiente_maxima_autoridad",
            "nueva_etapa": "maxima_autoridad"
        },
        ("pendiente_maxima_autoridad", "maxima_autoridad"): {
            "nuevo_estado": "pendiente_tics",
            "nueva_etapa": "tics"
        },
        ("pendiente_tics", "analista_tics"): {
            "nuevo_estado": "pendiente_ejecucion_tics",
            "nueva_etapa": "ejecucion_tics"
        },
        ("pendiente_ejecucion_tics", "analista_tics"): {
            "nuevo_estado": "finalizada",
            "nueva_etapa": "finalizado"
        }
    }

    return reglas.get((estado_actual, rol_actual))


def obtener_estado_rechazo_por_rol(estado_actual, rol_actual):
    rechazos = {
        "pendiente_jefe_inmediato": {
            "rol": "jefe_inmediato",
            "nuevo_estado": "rechazada_jefe_inmediato",
            "nueva_etapa": "jefe_inmediato"
        },
        "pendiente_maxima_autoridad": {
            "rol": "maxima_autoridad",
            "nuevo_estado": "rechazada_maxima_autoridad",
            "nueva_etapa": "maxima_autoridad"
        },
        "pendiente_tics": {
            "rol": "analista_tics",
            "nuevo_estado": "rechazada_tics",
            "nueva_etapa": "tics"
        }
    }

    regla = rechazos.get(estado_actual)

    if regla is None:
        return None

    if regla["rol"] != rol_actual:
        return None

    return regla

def archivo_pdf_valido(archivo):
    if archivo is None:
        return False

    nombre_archivo = archivo.filename or ""

    return nombre_archivo.lower().endswith(".pdf")

# =====================================================
# colocar firma electrónica en PDF
# =====================================================

def colocar_firma_en_pdf(pdf_entrada, imagen_firma, pdf_salida):
    """
    Coloca una imagen de firma en una posición fija del PDF.

    Coordenadas PyMuPDF:
    - x aumenta hacia la derecha
    - y aumenta hacia abajo
    - se trabaja en puntos PDF
    """

    documento = fitz.open(pdf_entrada)

    # Última página del PDF
    pagina = documento[-1]

    # =====================================================
    # POSICIÓN DE LA FIRMA
    # =====================================================
    # Ajusta estos valores según tu plantilla.
    # Esta posición coloca la firma en la parte inferior derecha.
    x = 360
    y = 680
    ancho = 170
    alto = 70

    rectangulo_firma = fitz.Rect(
        x,
        y,
        x + ancho,
        y + alto
    )

    pagina.insert_image(
        rectangulo_firma,
        filename=imagen_firma,
        keep_proportion=True
    )

    documento.save(pdf_salida)
    documento.close()

 

    # =====================================================
    # POSICIÓN DE LA FIRMA
    # =====================================================
    # x = izquierda / derecha
    # y = arriba / abajo
    # ancho y alto = tamaño de la firma

    x = 360
    y = 680
    ancho = 170
    alto = 70

    rectangulo_firma = fitz.Rect(
        x,
        y,
        x + ancho,
        y + alto
    )

    pagina.insert_image(
        rectangulo_firma,
        filename=imagen_firma,
        keep_proportion=True
    )

    documento.save(pdf_salida)
    documento.close()


# =====================================================
# firma electrónica automática
# =====================================================

@app.route("/api/admin/solicitudes/<int:solicitud_id>/firma-electronica", methods=["POST"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def subir_firma_electronica_y_generar_pdf(solicitud_id):
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]

    if "firma" not in request.files:
        return jsonify({
            "estado": "error",
            "mensaje": "debe seleccionar una imagen de firma."
        }), 400

    firma = request.files["firma"]

    if firma is None or not firma.filename:
        return jsonify({
            "estado": "error",
            "mensaje": "debe seleccionar una imagen válida."
        }), 400

    nombre_firma = secure_filename(firma.filename)
    extension = os.path.splitext(nombre_firma)[1].lower()

    extensiones_validas = [".png", ".jpg", ".jpeg"]

    if extension not in extensiones_validas:
        return jsonify({
            "estado": "error",
            "mensaje": "solo se permiten firmas en formato PNG, JPG o JPEG."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                estado,
                etapa_actual,
                bloqueada
            from solicitudes
            where id = %s
            limit 1;
        """, (solicitud_id,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "solicitud no encontrada."
            }), 404

        if solicitud["bloqueada"]:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "la solicitud se encuentra bloqueada."
            }), 409

                # =====================================================
        # Crear nombres y rutas
        # =====================================================

        nombre_base = f"{solicitud['codigo_solicitud']}_{rol_actual}_firma_electronica"

        nombre_imagen_firma = f"{nombre_base}{extension}"
        ruta_imagen_firma = os.path.join(FIRMADOS_FOLDER, nombre_imagen_firma)

        nombre_pdf_firmado = f"{nombre_base}.pdf"
        ruta_pdf_firmado = os.path.join(FIRMADOS_FOLDER, nombre_pdf_firmado)

        # =====================================================
        # Generar PDF base temporal desde la misma función del sistema
        # =====================================================
        # Tu endpoint normal /pdf genera el archivo en memoria con BytesIO,
        # por eso aquí se genera nuevamente el PDF base y se guarda temporalmente
        # en DOCUMENTOS_FOLDER para poder insertar la imagen de firma con PyMuPDF.
        # =====================================================

        solicitud_pdf, paginas_web, error_pdf = obtener_solicitud_completa_para_pdf(solicitud_id)

        if error_pdf:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": error_pdf
            }), 404

        incluir_seccion_tics = rol_actual == "analista_tics"

        pdf_buffer = generar_pdf_solicitud_a4(
            solicitud_pdf,
            paginas_web,
            incluir_seccion_tics=incluir_seccion_tics
        )

        nombre_pdf_generado = f"{solicitud['codigo_solicitud']}_base.pdf"
        ruta_pdf_generado = os.path.join(DOCUMENTOS_FOLDER, nombre_pdf_generado)

        with open(ruta_pdf_generado, "wb") as archivo_pdf_base:
            archivo_pdf_base.write(pdf_buffer.getvalue())

        # =====================================================
        # Guardar imagen de firma
        # =====================================================

        firma.save(ruta_imagen_firma)

        # =====================================================
        # Colocar firma en el PDF generado
        # =====================================================

        colocar_firma_en_pdf(
            pdf_entrada=ruta_pdf_generado,
            imagen_firma=ruta_imagen_firma,
            pdf_salida=ruta_pdf_firmado
        )

        # =====================================================
        # Validar que el PDF firmado realmente se haya creado
        # =====================================================

        if not os.path.exists(ruta_pdf_firmado):
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no se pudo generar el PDF firmado electrónicamente."
            }), 500

        # =====================================================
        # Registrar PDF firmado electrónicamente
        # =====================================================

        cursor.execute("""
            insert into solicitud_documentos (
                solicitud_id,
                etapa,
                rol_firmante,
                usuario_id,
                tipo_documento,
                nombre_archivo,
                ruta_archivo,
                mime_type,
                firmado,
                firma_validada,
                observacion
            ) values (
                %s, %s, %s, %s, %s, %s, %s, %s, 1, 1, %s
            );
        """, (
            solicitud_id,
            solicitud["etapa_actual"],
            rol_actual,
            usuario_actual["id"],
            "pdf_firmado_electronico",
            nombre_pdf_firmado,
            ruta_pdf_firmado,
            "application/pdf",
            "PDF generado por el sistema con firma electrónica colocada automáticamente."
        ))

        documento_id = cursor.lastrowid

        conexion.commit()

        cursor.close()
        conexion.close()

        registrar_auditoria(
            usuario_id=usuario_actual["id"],
            solicitud_id=solicitud_id,
            modulo="documentos",
            accion="generar_pdf_firmado_electronico",
            descripcion=f"firma electrónica colocada automáticamente por rol {rol_actual}",
            datos_anteriores=None,
            datos_nuevos={
                "documento_id": documento_id,
                "tipo_documento": "pdf_firmado_electronico",
                "nombre_archivo": nombre_pdf_firmado,
                "rol_firmante": rol_actual,
                "etapa": solicitud["etapa_actual"],
                "pdf_base": nombre_pdf_generado,
                "imagen_firma": nombre_imagen_firma
            }
        )

        return jsonify({
            "estado": "ok",
            "mensaje": "firma electrónica colocada correctamente en el PDF.",
            "documento": {
                "id": documento_id,
                "solicitud_id": solicitud_id,
                "tipo_documento": "pdf_firmado_electronico",
                "nombre_archivo": nombre_pdf_firmado,
                "rol_firmante": rol_actual,
                "etapa": solicitud["etapa_actual"],
                "firmado": True,
                "firma_validada": True
            }
        }), 201

    except Error as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al registrar la firma electrónica.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al colocar la firma electrónica.",
            "error": str(error)
        }), 500
# =====================================================
# carga de documentos firmados
# =====================================================

@app.route("/api/admin/solicitudes/<int:solicitud_id>/documentos", methods=["POST"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def subir_documento_firmado(solicitud_id):
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]

    if not request.files:
        return jsonify({
            "estado": "error",
            "mensaje": "debe seleccionar un archivo PDF."
        }), 400

    archivo = next(iter(request.files.values()))

    if archivo is None or not archivo.filename:
        return jsonify({
            "estado": "error",
            "mensaje": "debe seleccionar un archivo PDF válido."
        }), 400

    if not archivo_pdf_valido(archivo):
        return jsonify({
            "estado": "error",
            "mensaje": "solo se permiten archivos con extensión .pdf."
        }), 400

    tipo_documento = limpiar_texto(request.form.get("tipo_documento"))
    observacion = normalizar_espacios(request.form.get("observacion"))

    tipos_validos = [
        "pdf_firmado_manual",
        "pdf_firmado_electronico",
        "pdf_tics",
        "pdf_final"
    ]

    if tipo_documento not in tipos_validos:
        return jsonify({
            "estado": "error",
            "mensaje": "tipo de documento no válido.",
            "tipos_validos": tipos_validos
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                estado,
                etapa_actual,
                bloqueada
            from solicitudes
            where id = %s
            limit 1;
        """, (solicitud_id,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "solicitud no encontrada."
            }), 404

        nombre_original = secure_filename(archivo.filename)
        extension = os.path.splitext(nombre_original)[1].lower()

        nombre_archivo = f"{solicitud['codigo_solicitud']}_{rol_actual}_{tipo_documento}{extension}"
        ruta_archivo = os.path.join(FIRMADOS_FOLDER, nombre_archivo)

        archivo.save(ruta_archivo)

        cursor.execute("""
            insert into solicitud_documentos (
                solicitud_id,
                etapa,
                rol_firmante,
                usuario_id,
                tipo_documento,
                nombre_archivo,
                ruta_archivo,
                mime_type,
                firmado,
                firma_validada,
                observacion
            ) values (
                %s, %s, %s, %s, %s, %s, %s, %s, 1, 1, %s
            );
        """, (
            solicitud_id,
            solicitud["etapa_actual"],
            rol_actual,
            usuario_actual["id"],
            tipo_documento,
            nombre_archivo,
            ruta_archivo,
            "application/pdf",
            observacion
        ))

        documento_id = cursor.lastrowid

        conexion.commit()

        cursor.close()
        conexion.close()

        registrar_auditoria(
            usuario_id=usuario_actual["id"],
            solicitud_id=solicitud_id,
            modulo="documentos",
            accion="subir_documento_firmado",
            descripcion=f"documento firmado subido por rol {rol_actual}",
            datos_anteriores=None,
            datos_nuevos={
                "documento_id": documento_id,
                "tipo_documento": tipo_documento,
                "nombre_archivo": nombre_archivo,
                "rol_firmante": rol_actual,
                "etapa": solicitud["etapa_actual"]
            }
        )

        return jsonify({
            "estado": "ok",
            "mensaje": "documento firmado subido correctamente.",
            "documento": {
                "id": documento_id,
                "solicitud_id": solicitud_id,
                "tipo_documento": tipo_documento,
                "nombre_archivo": nombre_archivo,
                "rol_firmante": rol_actual,
                "etapa": solicitud["etapa_actual"],
                "firmado": True,
                "firma_validada": True
            }
        }), 201

    except Error as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al registrar el documento firmado.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al subir el documento.",
            "error": str(error)
        }), 500
    # =====================================================
# descargar último documento firmado de la solicitud
# =====================================================

@app.route("/api/admin/solicitudes/<int:solicitud_id>/documento-actual", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def descargar_documento_actual_solicitud(solicitud_id):
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        # =====================================================
        # verificar que exista la solicitud
        # =====================================================

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                estado,
                etapa_actual
            from solicitudes
            where id = %s
            limit 1;
        """, (solicitud_id,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "solicitud no encontrada."
            }), 404

        # =====================================================
        # buscar el último pdf firmado cargado
        # =====================================================

        cursor.execute("""
            select
                id,
                solicitud_id,
                etapa,
                rol_firmante,
                usuario_id,
                tipo_documento,
                nombre_archivo,
                ruta_archivo,
                mime_type,
                firmado,
                firma_validada,
                observacion,
                created_at,
                updated_at
            from solicitud_documentos
            where solicitud_id = %s
              and ruta_archivo is not null
              and ruta_archivo <> ''
              and mime_type = 'application/pdf'
              and tipo_documento in (
                'pdf_firmado_manual',
                'pdf_firmado_electronico',
                'pdf_tics',
                'pdf_final'
              )
            order by id desc
            limit 1;
        """, (solicitud_id,))

        documento = cursor.fetchone()

        cursor.close()
        conexion.close()

        if documento is None:
            return jsonify({
                "estado": "error",
                "mensaje": "todavía no existe un PDF firmado cargado para esta solicitud."
            }), 404

        ruta_archivo = documento.get("ruta_archivo")

        if not ruta_archivo:
            return jsonify({
                "estado": "error",
                "mensaje": "el documento no tiene ruta registrada."
            }), 404

        ruta_archivo = os.path.normpath(ruta_archivo)

        if not os.path.exists(ruta_archivo):
            return jsonify({
                "estado": "error",
                "mensaje": "el archivo firmado no existe físicamente en el servidor.",
                "ruta_archivo": ruta_archivo
            }), 404

        nombre_descarga = documento.get("nombre_archivo") or f"{solicitud['codigo_solicitud']}-firmado.pdf"

        return send_file(
            ruta_archivo,
            mimetype=documento.get("mime_type") or "application/pdf",
            as_attachment=True,
            download_name=nombre_descarga
        )

    except Error as error:
        try:
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al descargar el documento firmado.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al descargar el documento firmado.",
            "error": str(error)
        }), 500
    

# =====================================================
# aprobación de solicitud
# =====================================================

@app.route("/api/admin/solicitudes/<int:solicitud_id>/aprobar", methods=["PUT"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def aprobar_solicitud(solicitud_id):
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        # =====================================================
        # Obtener solicitud actual
        # =====================================================

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                estado,
                etapa_actual,
                bloqueada
            from solicitudes
            where id = %s
            limit 1;
        """, (solicitud_id,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "solicitud no encontrada."
            }), 404

        if solicitud["bloqueada"]:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "la solicitud se encuentra bloqueada y no puede ser procesada."
            }), 409

        estado_anterior = solicitud["estado"]
        etapa_anterior = solicitud["etapa_actual"]

        # =====================================================
        # Validar rol y estado actual
        # =====================================================

        regla = obtener_siguiente_estado_por_rol(estado_anterior, rol_actual)

        if regla is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no tiene permisos para aprobar esta solicitud en su estado actual.",
                "rol_actual": rol_actual,
                "estado_actual": estado_anterior
            }), 403

        # =====================================================
        # Validar documento firmado obligatorio
        # =====================================================

        cursor.execute("""
            select
                id,
                tipo_documento,
                nombre_archivo,
                ruta_archivo,
                mime_type,
                firmado,
                firma_validada
            from solicitud_documentos
            where solicitud_id = %s
              and mime_type = 'application/pdf'
              and (
                    firmado = 1
                    or firma_validada = 1
                    or tipo_documento in (
                        'pdf_firmado_manual',
                        'pdf_firmado_electronico',
                        'pdf_tics',
                        'pdf_final'
                    )
              )
            order by id desc
            limit 1;
        """, (solicitud_id,))

        documento_firmado = cursor.fetchone()

        if documento_firmado is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "antes de aprobar debe existir un PDF firmado electrónicamente con FirmaEC.",
                "requisito": "pdf_firmado_electronico_firmaec",
                "rol_actual": rol_actual,
                "estado_actual": estado_anterior
            }), 409

        nuevo_estado = regla["nuevo_estado"]
        nueva_etapa = regla["nueva_etapa"]

        # =====================================================
        # Actualizar flujo de solicitud
        # =====================================================

        cursor.execute("""
            update solicitudes
            set
                estado = %s,
                etapa_actual = %s,
                updated_at = now()
            where id = %s;
        """, (nuevo_estado, nueva_etapa, solicitud_id))

        conexion.commit()

        cursor.close()
        conexion.close()

        # =====================================================
        # Auditoría
        # =====================================================

        registrar_auditoria(
            usuario_id=usuario_actual["id"],
            solicitud_id=solicitud_id,
            modulo="flujo_solicitud",
            accion="aprobar_solicitud",
            descripcion=f"solicitud {solicitud['codigo_solicitud']} aprobada por rol {rol_actual}",
            datos_anteriores={
                "estado": estado_anterior,
                "etapa_actual": etapa_anterior
            },
            datos_nuevos={
                "estado": nuevo_estado,
                "etapa_actual": nueva_etapa,
                "documento_firmado_id": documento_firmado["id"],
                "tipo_documento": documento_firmado["tipo_documento"],
                "nombre_archivo": documento_firmado["nombre_archivo"]
            }
        )

        # =====================================================
        # Correo al solicitante cuando TICS finaliza todo
        # =====================================================

        correo_enviado = False
        error_correo = None

        if (
            rol_actual == "analista_tics"
            and estado_anterior == "pendiente_ejecucion_tics"
            and nuevo_estado == "finalizada"
        ):
            try:
                enviar_correo_finalizacion_solicitud(solicitud)
                correo_enviado = True

                registrar_auditoria(
                    usuario_id=usuario_actual["id"],
                    solicitud_id=solicitud_id,
                    modulo="correo",
                    accion="enviar_correo_finalizacion",
                    descripcion=f"correo de finalización enviado a {solicitud['correo_institucional']}",
                    datos_anteriores=None,
                    datos_nuevos={
                        "correo_destino": solicitud["correo_institucional"],
                        "codigo_solicitud": solicitud["codigo_solicitud"],
                        "estado": nuevo_estado
                    }
                )

            except Exception as error:
                correo_enviado = False
                error_correo = str(error)

                registrar_auditoria(
                    usuario_id=usuario_actual["id"],
                    solicitud_id=solicitud_id,
                    modulo="correo",
                    accion="error_correo_finalizacion",
                    descripcion=f"no se pudo enviar correo de finalización a {solicitud['correo_institucional']}",
                    datos_anteriores=None,
                    datos_nuevos={
                        "correo_destino": solicitud["correo_institucional"],
                        "codigo_solicitud": solicitud["codigo_solicitud"],
                        "error": error_correo
                    }
                )

        mensaje_respuesta = "solicitud aprobada correctamente."

        if (
            rol_actual == "analista_tics"
            and estado_anterior == "pendiente_tics"
            and nuevo_estado == "pendiente_ejecucion_tics"
        ):
            mensaje_respuesta = "validación TICS aprobada correctamente. la solicitud pasa a ejecución técnica."

        if (
            rol_actual == "analista_tics"
            and estado_anterior == "pendiente_ejecucion_tics"
            and nuevo_estado == "finalizada"
        ):
            if correo_enviado:
                mensaje_respuesta = "la solicitud fue finalizada correctamente por TICS y se notificó al solicitante."
            else:
                mensaje_respuesta = "la solicitud fue finalizada correctamente por TICS, pero no se pudo enviar el correo al solicitante."

        return jsonify({
            "estado": "ok",
            "mensaje": mensaje_respuesta,
            "correo_enviado": correo_enviado,
            "error_correo": error_correo,
            "solicitud": {
                "id": solicitud_id,
                "codigo_solicitud": solicitud["codigo_solicitud"],
                "correo_destino": solicitud.get("correo_institucional"),
                "estado_anterior": estado_anterior,
                "estado_actual": nuevo_estado,
                "etapa_actual": nueva_etapa,
                "documento_firmado": {
                    "id": documento_firmado["id"],
                    "tipo_documento": documento_firmado["tipo_documento"],
                    "nombre_archivo": documento_firmado["nombre_archivo"]
                }
            }
        }), 200

    except Error as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al aprobar la solicitud.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al aprobar la solicitud.",
            "error": str(error)
        }), 500

# =====================================================
# envío de correo por rechazo de solicitud
# =====================================================

def enviar_correo_rechazo_solicitud(solicitud, motivo, rol_rechazo):
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASSWORD:
        print("configuración SMTP incompleta. No se envió el correo de rechazo.")
        return False

    correo_destino = limpiar_texto(solicitud.get("correo_institucional")).lower()

    if not correo_destino:
        print("la solicitud no tiene correo registrado.")
        return False

    codigo_solicitud = solicitud.get("codigo_solicitud", "")
    nombres = solicitud.get("nombres_completos", "")
    fecha_actual = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    nombres_seguro = html.escape(str(nombres))
    codigo_seguro = html.escape(str(codigo_solicitud))
    motivo_seguro = html.escape(str(motivo))
    rol_seguro = html.escape(str(rol_rechazo))
    fecha_segura = html.escape(str(fecha_actual))

    asunto = f"❌ Solicitud Rechazada - {codigo_solicitud}"

    cuerpo_texto = f"""
Solicitud de Liberación Web Rechazada

Estimado/a {nombres},

Se informa que su solicitud de liberación web ha sido rechazada.

Código de solicitud: {codigo_solicitud}
Rechazado por: {rol_rechazo}
Fecha: {fecha_actual}

Motivo del rechazo:
{motivo}

Puede revisar la observación y registrar una nueva solicitud con la información corregida.

Sistema de Gestión de Solicitudes de Liberación Web - INAMHI
"""

    cuerpo_html = f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.10);">

          <!-- ENCABEZADO ROJO -->
          <tr>
            <td style="background:linear-gradient(135deg,#b91c1c 0%,#7f1d1d 100%);padding:40px;text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="background:rgba(255,255,255,0.2);display:inline-block;border-radius:50%;width:72px;height:72px;line-height:72px;text-align:center;font-size:36px;margin-bottom:16px;">❌</div>
                    <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;letter-spacing:0.5px;">Solicitud Rechazada</h1>
                    <p style="color:#fecaca;margin:8px 0 0;font-size:14px;">Por favor revise el motivo e ingrese una nueva solicitud corregida</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BADGE ESTADO -->
          <tr>
            <td align="center" style="padding:28px 40px 0;">
              <span style="display:inline-block;background:#fef2f2;color:#991b1b;font-size:13px;font-weight:700;padding:10px 28px;border-radius:50px;letter-spacing:0.6px;border:1px solid #fecaca;">
                🚫 &nbsp; PROCESO DETENIDO - ACCIÓN REQUERIDA
              </span>
            </td>
          </tr>

          <!-- SALUDO -->
          <tr>
            <td style="padding:28px 40px 0;color:#1e293b;">
              <p style="font-size:17px;margin:0 0 12px;">Estimado/a <strong style="color:#b91c1c;">{nombres_seguro}</strong>,</p>
              <p style="font-size:15px;line-height:1.75;color:#475569;margin:0;">
                Le informamos que su solicitud de liberación web ha sido
                <strong style="color:#b91c1c;">rechazada</strong> en la etapa de revisión.
                A continuación encontrará los detalles del rechazo y el motivo registrado.
              </p>
            </td>
          </tr>

          <!-- TABLA DE DATOS -->
          <tr>
            <td style="padding:28px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #fee2e2;">
                <tr style="background:#fef2f2;">
                  <td style="padding:14px 18px;font-size:13px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #fee2e2;" colspan="2">
                    Detalle del rechazo
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;font-size:14px;color:#64748b;font-weight:600;border-bottom:1px solid #fef2f2;width:45%;">Código de solicitud</td>
                  <td style="padding:14px 18px;font-size:14px;color:#0f172a;font-family:monospace;font-weight:700;border-bottom:1px solid #fef2f2;">{codigo_seguro}</td>
                </tr>
                <tr style="background:#fffbfb;">
                  <td style="padding:14px 18px;font-size:14px;color:#64748b;font-weight:600;border-bottom:1px solid #fef2f2;">Rechazado por</td>
                  <td style="padding:14px 18px;font-size:14px;color:#0f172a;border-bottom:1px solid #fef2f2;">{rol_seguro}</td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;font-size:14px;color:#64748b;font-weight:600;">Fecha del rechazo</td>
                  <td style="padding:14px 18px;font-size:14px;color:#0f172a;">{fecha_segura}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CAJA MOTIVO -->
          <tr>
            <td style="padding:20px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:5px solid #ef4444;border-radius:0 12px 12px 0;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#7f1d1d;">⚠️ &nbsp;Motivo del rechazo</p>
                    <p style="margin:0;font-size:14px;line-height:1.7;color:#991b1b;font-style:italic;">&ldquo;{motivo_seguro}&rdquo;</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CAJA ACCIÓN -->
          <tr>
            <td style="padding:20px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-left:5px solid #f59e0b;border-radius:0 12px 12px 0;">
                <tr>
                  <td style="padding:18px 22px;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#92400e;">💡 &nbsp;¿Qué puede hacer?</p>
                    <p style="margin:0;font-size:14px;line-height:1.7;color:#b45309;">
                      Revise con detenimiento el motivo indicado, corrija la información y
                      <strong>registre una nueva solicitud</strong> con los datos actualizados.
                      Si tiene dudas, comuníquese con el área de TICS.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FIRMA -->
          <tr>
            <td style="padding:32px 40px 28px;">
              <p style="margin:0 0 4px;font-size:14px;color:#94a3b8;">Atentamente,</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">Sistema de Gestión de Solicitudes de Liberación Web</p>
              <p style="margin:4px 0 0;font-size:14px;color:#b91c1c;font-weight:600;">Instituto Nacional de Meteorología e Hidrología · INAMHI</p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc;padding:18px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                &copy; {datetime.datetime.now().year} Instituto Nacional de Meteorología e Hidrología &mdash; Ecuador
                <br>Este es un mensaje automático, por favor no responda a este correo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    try:
        enviar_correo(
            destinatario=correo_destino,
            asunto=asunto,
            cuerpo=cuerpo_texto,
            cuerpo_html=cuerpo_html
        )
        print(f"correo de rechazo enviado a {correo_destino}")
        return True

    except Exception as error:
        print("error al enviar correo de rechazo:", error)
        return False
# =====================================================
# correo de finalización / aprobación total de solicitud
# =====================================================
def enviar_correo_finalizacion_solicitud(solicitud):
    destinatario = limpiar_texto(solicitud.get("correo_institucional")).lower()
    codigo_solicitud = solicitud.get("codigo_solicitud")
    nombres = solicitud.get("nombres_completos") or "usuario/a"
    fecha_actual = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    if not destinatario:
        raise Exception("la solicitud no tiene correo institucional registrado.")

    asunto = f"✅ Solicitud de Liberación Web finalizada - {codigo_solicitud}"
    
    # ✅ SEGURIDAD: Escapar caracteres HTML para evitar inyección de scripts
    nombres_seguro = html.escape(str(nombres))
    codigo_seguro = html.escape(str(codigo_solicitud))
    fecha_segura = html.escape(str(fecha_actual))

    # Versión texto plano (fallback)
    cuerpo_texto = f"""
Estimado/a {nombres},

Su solicitud de Liberación Web con código {codigo_solicitud} ha sido aprobada y finalizada correctamente.
Estado: Finalizada | Fecha: {fecha_actual}

Atentamente,
Sistema de Gestión de Solicitudes - INAMHI
"""

    # Versión HTML con diseño profesional mejorado
    cuerpo_html = f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.10);">

          <!-- ENCABEZADO VERDE -->
          <tr>
            <td style="background:linear-gradient(135deg,#059669 0%,#064e3b 100%);padding:40px;text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="background:rgba(255,255,255,0.2);display:inline-block;border-radius:50%;width:72px;height:72px;line-height:72px;text-align:center;font-size:36px;margin-bottom:16px;">✅</div>
                    <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;letter-spacing:0.5px;">¡Solicitud Aprobada!</h1>
                    <p style="color:#a7f3d0;margin:8px 0 0;font-size:14px;">Su acceso a la red ha sido configurado exitosamente</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BADGE ESTADO -->
          <tr>
            <td align="center" style="padding:28px 40px 0;">
              <span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:700;padding:10px 28px;border-radius:50px;letter-spacing:0.6px;border:1px solid #86efac;">
                🎉 &nbsp; PROCESO FINALIZADO CORRECTAMENTE
              </span>
            </td>
          </tr>

          <!-- SALUDO -->
          <tr>
            <td style="padding:28px 40px 0;color:#1e293b;">
              <p style="font-size:17px;margin:0 0 12px;">Estimado/a <strong style="color:#059669;">{nombres_seguro}</strong>,</p>
              <p style="font-size:15px;line-height:1.75;color:#475569;margin:0;">
                Nos complace informarle que su solicitud de liberación web ha sido
                <strong style="color:#059669;">aprobada y finalizada</strong> satisfactoriamente.
                Los accesos solicitados han sido procesados por la Unidad de
                <strong>Tecnologías de la Información y Comunicación (TICS)</strong>.
              </p>
            </td>
          </tr>

          <!-- TABLA DE DATOS -->
          <tr>
            <td style="padding:28px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #d1fae5;">
                <tr style="background:#ecfdf5;">
                  <td style="padding:14px 18px;font-size:13px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #d1fae5;" colspan="2">
                    Resumen de la solicitud
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;font-size:14px;color:#64748b;font-weight:600;border-bottom:1px solid #f0fdf4;width:45%;">Código</td>
                  <td style="padding:14px 18px;font-size:14px;color:#0f172a;font-family:monospace;font-weight:700;border-bottom:1px solid #f0fdf4;">{codigo_seguro}</td>
                </tr>
                <tr style="background:#f9fefe;">
                  <td style="padding:14px 18px;font-size:14px;color:#64748b;font-weight:600;border-bottom:1px solid #f0fdf4;">Estado</td>
                  <td style="padding:14px 18px;border-bottom:1px solid #f0fdf4;">
                    <span style="background:#dcfce7;color:#166534;font-size:12px;font-weight:700;padding:5px 14px;border-radius:50px;text-transform:uppercase;">✓ Finalizada</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;font-size:14px;color:#64748b;font-weight:600;">Fecha</td>
                  <td style="padding:14px 18px;font-size:14px;color:#0f172a;">{fecha_segura}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CAJA ¿QUÉ SIGUE? -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-left:5px solid #10b981;border-radius:0 12px 12px 0;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#065f46;">🌐 &nbsp;Sus accesos están activos</p>
                    <p style="margin:0;font-size:14px;line-height:1.7;color:#047857;">
                      Los accesos web solicitados han sido <strong>configurados en los sistemas institucionales</strong>.
                      Si en las próximas <strong>2 horas hábiles</strong> no puede acceder a las páginas autorizadas,
                      comuníquese con la mesa de ayuda de TICS para soporte.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FIRMA -->
          <tr>
            <td style="padding:32px 40px 28px;">
              <p style="margin:0 0 4px;font-size:14px;color:#94a3b8;">Atentamente,</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">Sistema de Gestión de Solicitudes de Liberación Web</p>
              <p style="margin:4px 0 0;font-size:14px;color:#059669;font-weight:600;">Instituto Nacional de Meteorología e Hidrología · INAMHI</p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc;padding:18px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                &copy; {datetime.datetime.now().year} Instituto Nacional de Meteorología e Hidrología &mdash; Ecuador
                <br>Este es un mensaje automático, por favor no responda a este correo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    # Llamada a tu función existente que soporta cuerpo_html
    enviar_correo(
        destinatario=destinatario,
        asunto=asunto,
        cuerpo=cuerpo_texto,
        cuerpo_html=cuerpo_html
    )
# =====================================================
# rechazo de solicitud
# =====================================================

@app.route("/api/admin/solicitudes/<int:solicitud_id>/rechazar", methods=["PUT"])
@token_requerido
@roles_permitidos("jefe_inmediato", "maxima_autoridad", "analista_tics")
def rechazar_solicitud(solicitud_id):
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]

    data = request.get_json() or {}
    motivo = normalizar_espacios(data.get("motivo"))

    if not motivo:
        return jsonify({
            "estado": "error",
            "mensaje": "el motivo del rechazo es obligatorio."
        }), 400

    if len(motivo) < 10:
        return jsonify({
            "estado": "error",
            "mensaje": "el motivo del rechazo debe tener mínimo 10 caracteres."
        }), 400

    if len(motivo) > 1000:
        return jsonify({
            "estado": "error",
            "mensaje": "el motivo del rechazo no puede superar 1000 caracteres."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        # =====================================================
        # Obtener solicitud actual
        # =====================================================

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                nombres_completos,
                correo_institucional,
                estado,
                etapa_actual,
                bloqueada
            from solicitudes
            where id = %s
            limit 1;
        """, (solicitud_id,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "solicitud no encontrada."
            }), 404

        if solicitud["bloqueada"]:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "la solicitud se encuentra bloqueada y no puede ser procesada."
            }), 409

        estado_anterior = solicitud["estado"]
        etapa_anterior = solicitud["etapa_actual"]

        # =====================================================
        # Reglas de rechazo por rol
        # =====================================================

        reglas_rechazo = {
            "jefe_inmediato": {
                "estado_permitido": "pendiente_jefe_inmediato",
                "nuevo_estado": "rechazada_jefe_inmediato",
                "nueva_etapa": "jefe_inmediato",
                "mensaje": "solicitud rechazada por el jefe inmediato."
            },
            "maxima_autoridad": {
                "estado_permitido": "pendiente_maxima_autoridad",
                "nuevo_estado": "rechazada_maxima_autoridad",
                "nueva_etapa": "maxima_autoridad",
                "mensaje": "solicitud rechazada por la máxima autoridad."
            },
            "analista_tics": {
                "estado_permitido": "pendiente_tics",
                "nuevo_estado": "rechazada_tics",
                "nueva_etapa": "tics",
                "mensaje": "solicitud rechazada por TICS."
            }
        }

        regla = reglas_rechazo.get(rol_actual)

        if regla is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "rol no autorizado para rechazar solicitudes."
            }), 403

        if estado_anterior != regla["estado_permitido"]:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": f"la solicitud no puede ser rechazada por {rol_actual} en el estado actual.",
                "estado_actual": estado_anterior,
                "estado_requerido": regla["estado_permitido"]
            }), 409

        # =====================================================
        # Actualizar solicitud
        # =====================================================

        cursor.execute("""
            update solicitudes
            set
                estado = %s,
                etapa_actual = %s,
                observacion_general = %s,
                updated_at = current_timestamp
            where id = %s;
        """, (
            regla["nuevo_estado"],
            regla["nueva_etapa"],
            motivo,
            solicitud_id
        ))

        # =====================================================
        # Registrar auditoría
        # =====================================================

        datos_anteriores = {
            "estado": estado_anterior,
            "etapa_actual": etapa_anterior
        }

        datos_nuevos = {
            "estado": regla["nuevo_estado"],
            "etapa_actual": regla["nueva_etapa"],
            "motivo": motivo,
            "rechazado_por": rol_actual,
            "usuario_id": usuario_actual["id"]
        }

        cursor.execute("""
            insert into auditoria (
                usuario_id,
                solicitud_id,
                modulo,
                accion,
                descripcion,
                datos_anteriores,
                datos_nuevos,
                ip_origen,
                user_agent
            ) values (
                %s, %s, %s, %s, %s, %s, %s, %s, %s
            );
        """, (
            usuario_actual["id"],
            solicitud_id,
            "flujo_solicitud",
            "rechazar_solicitud",
            f"{regla['mensaje']} código: {solicitud['codigo_solicitud']}",
            json.dumps(datos_anteriores, ensure_ascii=False),
            json.dumps(datos_nuevos, ensure_ascii=False),
            request.remote_addr,
            request.headers.get("User-Agent")
        ))

        conexion.commit()

       
       # =====================================================
        # Enviar correo automático al solicitante
        # =====================================================

        correo_enviado = False
        error_correo = None

        try:
            correo_enviado = enviar_correo_rechazo_solicitud(
                solicitud=solicitud,
                motivo=motivo,
                rol_rechazo=rol_actual
            )
            print("==============================================")
            print("RESULTADO CORREO DE RECHAZO")
            print("DESTINATARIO:", solicitud.get("correo_institucional"))
            print("CORREO ENVIADO:", correo_enviado)
            print("ERROR CORREO:", error_correo)
            print("==============================================")
        except Exception as error_email:
            correo_enviado = False
            error_correo = str(error_email)
            print("error al enviar correo de rechazo:", error_correo)

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": regla["mensaje"],
            "correo_enviado": correo_enviado,
            "error_correo": error_correo,
            "solicitud": {
                "id": solicitud_id,
                "codigo_solicitud": solicitud["codigo_solicitud"],
                "correo_destino": solicitud["correo_institucional"],
                "estado_anterior": estado_anterior,
                "estado_actual": regla["nuevo_estado"],
                "etapa_actual": regla["nueva_etapa"],
                "motivo": motivo
            }
        }), 200

    except Error as error:
        try:
            conexion.rollback()
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al rechazar la solicitud.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al rechazar la solicitud.",
            "error": str(error)
        }), 500
       


# =====================================================
# manejo de errores
# =====================================================

@app.errorhandler(404)
def error_404(error):
    return jsonify({
        "estado": "error",
        "mensaje": "ruta no encontrada."
    }), 404


@app.errorhandler(405)
def error_405(error):
    return jsonify({
        "estado": "error",
        "mensaje": "método no permitido para esta ruta."
    }), 405


@app.errorhandler(413)
def error_413(error):
    return jsonify({
        "estado": "error",
        "mensaje": "el archivo supera el tamaño máximo permitido de 15 MB."
    }), 413


@app.errorhandler(500)
def error_500(error):
    return jsonify({
        "estado": "error",
        "mensaje": "error interno del servidor."
    }), 500

# =====================================================
# listado de auditoría
# =====================================================

@app.route("/api/admin/auditoria", methods=["GET"])
@token_requerido
@roles_permitidos("administrador")
def listar_auditoria():
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                a.id,
                a.usuario_id,
                a.solicitud_id,
                u.usuario,
                u.nombres,
                u.apellidos,
                s.codigo_solicitud,
                a.modulo,
                a.accion,
                a.descripcion,
                a.datos_anteriores,
                a.datos_nuevos,
                a.ip_origen,
                a.user_agent,
                a.created_at
            from auditoria a
            left join usuarios u on u.id = a.usuario_id
            left join solicitudes s on s.id = a.solicitud_id
            order by a.created_at desc, a.id desc
            limit 500;
        """)

        registros = cursor.fetchall()

        for registro in registros:
            registro["created_at"] = serializar_fecha(registro["created_at"])

            if registro.get("datos_anteriores") is None:
                registro["datos_anteriores"] = None

            if registro.get("datos_nuevos") is None:
                registro["datos_nuevos"] = None

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "auditoría obtenida correctamente.",
            "total": len(registros),
            "auditoria": registros
        }), 200

    except Error as error:
        try:
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener la auditoría.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al obtener la auditoría.",
            "error": str(error)
        }), 500
    
    # =====================================================
# listado de usuarios
# =====================================================

@app.route("/api/admin/usuarios", methods=["GET"])
@token_requerido
@roles_permitidos("administrador")
def listar_usuarios_admin():
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                u.id,
                u.nombres,
                u.apellidos,
                u.cedula,
                u.correo,
                u.usuario,
                r.nombre as rol,
                u.cargo,
                u.area_unidad,
                u.dependencia,
                u.telefono_ext,
                u.estado,
                u.ultimo_acceso,
                u.created_at,
                u.updated_at
            from usuarios u
            inner join roles r on r.id = u.rol_id
            order by u.id desc;
        """)

        usuarios = cursor.fetchall()

        for usuario in usuarios:
            usuario["ultimo_acceso"] = serializar_fecha(usuario["ultimo_acceso"])
            usuario["created_at"] = serializar_fecha(usuario["created_at"])
            usuario["updated_at"] = serializar_fecha(usuario["updated_at"])

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "usuarios obtenidos correctamente.",
            "total": len(usuarios),
            "usuarios": usuarios
        }), 200

    except Error as error:
        try:
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener los usuarios.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al obtener los usuarios.",
            "error": str(error)
        }), 500
    # =====================================================
# crear usuario
# =====================================================

@app.route("/api/admin/usuarios", methods=["POST"])
@token_requerido
@roles_permitidos("administrador")
def crear_usuario_admin():
    usuario_actual = request.usuario_actual
    data = request.get_json() or {}

    nombres = normalizar_espacios(data.get("nombres"))
    apellidos = normalizar_espacios(data.get("apellidos"))
    cedula = limpiar_texto(data.get("cedula"))
    correo = limpiar_texto(data.get("correo")).lower()
    usuario = limpiar_texto(data.get("usuario")).lower()
    password = limpiar_texto(data.get("password"))
    rol = limpiar_texto(data.get("rol"))
    cargo = normalizar_espacios(data.get("cargo"))
    area_unidad = normalizar_espacios(data.get("area_unidad"))
    dependencia = normalizar_espacios(data.get("dependencia"))
    telefono_ext = limpiar_texto(data.get("telefono_ext"))
    estado = limpiar_texto(data.get("estado")) or "activo"

    errores = {}

    if not nombres:
        errores["nombres"] = "los nombres son obligatorios."

    if not apellidos:
        errores["apellidos"] = "los apellidos son obligatorios."

    if not re.match(r"^\d{10}$", cedula):
        errores["cedula"] = "la cédula debe tener exactamente 10 números."

    if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", correo):
        errores["correo"] = "ingrese un correo válido."

    if not usuario:
        errores["usuario"] = "el usuario es obligatorio."

    if not password or len(password) < 6:
        errores["password"] = "la contraseña debe tener mínimo 6 caracteres."

    if rol not in ["administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics"]:
        errores["rol"] = "rol no válido."

    if estado not in ["activo", "inactivo"]:
        errores["estado"] = "estado no válido."

    if not cargo:
        errores["cargo"] = "el cargo es obligatorio."

    if not area_unidad:
        errores["area_unidad"] = "el área o unidad es obligatoria."

    if not dependencia:
        errores["dependencia"] = "la dependencia es obligatoria."

    if errores:
        return jsonify({
            "estado": "error",
            "mensaje": "existen errores de validación.",
            "errores": errores
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select id
            from roles
            where nombre = %s
              and estado = 'activo'
            limit 1;
        """, (rol,))

        rol_encontrado = cursor.fetchone()

        if rol_encontrado is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "el rol seleccionado no existe o está inactivo."
            }), 400

        cursor.execute("""
            select id
            from usuarios
            where cedula = %s
               or correo = %s
               or usuario = %s
            limit 1;
        """, (cedula, correo, usuario))

        duplicado = cursor.fetchone()

        if duplicado:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "ya existe un usuario con la misma cédula, correo o nombre de usuario."
            }), 409

        password_hash = bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt()
        ).decode("utf-8")

        cursor.execute("""
            insert into usuarios (
                rol_id,
                nombres,
                apellidos,
                cedula,
                correo,
                usuario,
                password_hash,
                cargo,
                area_unidad,
                dependencia,
                telefono_ext,
                estado
            ) values (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            );
        """, (
            rol_encontrado["id"],
            nombres,
            apellidos,
            cedula,
            correo,
            usuario,
            password_hash,
            cargo,
            area_unidad,
            dependencia,
            telefono_ext,
            estado
        ))

        usuario_id = cursor.lastrowid

        cursor.execute("""
            insert into auditoria (
                usuario_id,
                solicitud_id,
                modulo,
                accion,
                descripcion,
                datos_anteriores,
                datos_nuevos,
                ip_origen,
                user_agent
            ) values (
                %s, null, 'usuarios', 'crear', %s, null, %s, %s, %s
            );
        """, (
            usuario_actual["id"],
            f"usuario creado: {usuario}",
            json.dumps({
                "id": usuario_id,
                "usuario": usuario,
                "rol": rol,
                "estado": estado
            }, ensure_ascii=False),
            request.remote_addr,
            request.headers.get("User-Agent")
        ))

        conexion.commit()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "usuario registrado correctamente.",
            "usuario": {
                "id": usuario_id,
                "nombres": nombres,
                "apellidos": apellidos,
                "cedula": cedula,
                "correo": correo,
                "usuario": usuario,
                "rol": rol,
                "cargo": cargo,
                "area_unidad": area_unidad,
                "dependencia": dependencia,
                "telefono_ext": telefono_ext,
                "estado": estado
            }
        }), 201

    except Error as error:
        try:
            conexion.rollback()
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al registrar el usuario.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al registrar el usuario.",
            "error": str(error)
        }), 500


# =====================================================
# actualizar usuario
# =====================================================

@app.route("/api/admin/usuarios/<int:usuario_id>", methods=["PUT"])
@token_requerido
@roles_permitidos("administrador")
def actualizar_usuario_admin(usuario_id):
    usuario_actual = request.usuario_actual
    data = request.get_json() or {}

    nombres = normalizar_espacios(data.get("nombres"))
    apellidos = normalizar_espacios(data.get("apellidos"))
    cedula = limpiar_texto(data.get("cedula"))
    correo = limpiar_texto(data.get("correo")).lower()
    usuario = limpiar_texto(data.get("usuario")).lower()
    password = limpiar_texto(data.get("password"))
    rol = limpiar_texto(data.get("rol"))
    cargo = normalizar_espacios(data.get("cargo"))
    area_unidad = normalizar_espacios(data.get("area_unidad"))
    dependencia = normalizar_espacios(data.get("dependencia"))
    telefono_ext = limpiar_texto(data.get("telefono_ext"))
    estado = limpiar_texto(data.get("estado")) or "activo"

    errores = {}

    if not nombres:
        errores["nombres"] = "los nombres son obligatorios."

    if not apellidos:
        errores["apellidos"] = "los apellidos son obligatorios."

    if not re.match(r"^\d{10}$", cedula):
        errores["cedula"] = "la cédula debe tener exactamente 10 números."

    if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", correo):
        errores["correo"] = "ingrese un correo válido."

    if not usuario:
        errores["usuario"] = "el usuario es obligatorio."

    if password and len(password) < 6:
        errores["password"] = "la contraseña debe tener mínimo 6 caracteres."

    if rol not in ["administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics"]:
        errores["rol"] = "rol no válido."

    if estado not in ["activo", "inactivo"]:
        errores["estado"] = "estado no válido."

    if not cargo:
        errores["cargo"] = "el cargo es obligatorio."

    if not area_unidad:
        errores["area_unidad"] = "el área o unidad es obligatoria."

    if not dependencia:
        errores["dependencia"] = "la dependencia es obligatoria."

    if errores:
        return jsonify({
            "estado": "error",
            "mensaje": "existen errores de validación.",
            "errores": errores
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                u.id,
                u.rol_id,
                r.nombre as rol,
                u.nombres,
                u.apellidos,
                u.cedula,
                u.correo,
                u.usuario,
                u.cargo,
                u.area_unidad,
                u.dependencia,
                u.telefono_ext,
                u.estado
            from usuarios u
            inner join roles r on r.id = u.rol_id
            where u.id = %s
            limit 1;
        """, (usuario_id,))

        usuario_anterior = cursor.fetchone()

        if usuario_anterior is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "usuario no encontrado."
            }), 404

        cursor.execute("""
            select id
            from roles
            where nombre = %s
              and estado = 'activo'
            limit 1;
        """, (rol,))

        rol_encontrado = cursor.fetchone()

        if rol_encontrado is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "el rol seleccionado no existe o está inactivo."
            }), 400

        cursor.execute("""
            select id
            from usuarios
            where id <> %s
              and (
                cedula = %s
                or correo = %s
                or usuario = %s
              )
            limit 1;
        """, (usuario_id, cedula, correo, usuario))

        duplicado = cursor.fetchone()

        if duplicado:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "ya existe otro usuario con la misma cédula, correo o nombre de usuario."
            }), 409

        if password:
            password_hash = bcrypt.hashpw(
                password.encode("utf-8"),
                bcrypt.gensalt()
            ).decode("utf-8")

            cursor.execute("""
                update usuarios
                set
                    rol_id = %s,
                    nombres = %s,
                    apellidos = %s,
                    cedula = %s,
                    correo = %s,
                    usuario = %s,
                    password_hash = %s,
                    cargo = %s,
                    area_unidad = %s,
                    dependencia = %s,
                    telefono_ext = %s,
                    estado = %s
                where id = %s;
            """, (
                rol_encontrado["id"],
                nombres,
                apellidos,
                cedula,
                correo,
                usuario,
                password_hash,
                cargo,
                area_unidad,
                dependencia,
                telefono_ext,
                estado,
                usuario_id
            ))
        else:
            cursor.execute("""
                update usuarios
                set
                    rol_id = %s,
                    nombres = %s,
                    apellidos = %s,
                    cedula = %s,
                    correo = %s,
                    usuario = %s,
                    cargo = %s,
                    area_unidad = %s,
                    dependencia = %s,
                    telefono_ext = %s,
                    estado = %s
                where id = %s;
            """, (
                rol_encontrado["id"],
                nombres,
                apellidos,
                cedula,
                correo,
                usuario,
                cargo,
                area_unidad,
                dependencia,
                telefono_ext,
                estado,
                usuario_id
            ))

        datos_nuevos = {
            "id": usuario_id,
            "nombres": nombres,
            "apellidos": apellidos,
            "cedula": cedula,
            "correo": correo,
            "usuario": usuario,
            "rol": rol,
            "cargo": cargo,
            "area_unidad": area_unidad,
            "dependencia": dependencia,
            "telefono_ext": telefono_ext,
            "estado": estado,
            "password_actualizada": bool(password)
        }

        cursor.execute("""
            insert into auditoria (
                usuario_id,
                solicitud_id,
                modulo,
                accion,
                descripcion,
                datos_anteriores,
                datos_nuevos,
                ip_origen,
                user_agent
            ) values (
                %s, null, 'usuarios', 'actualizar', %s, %s, %s, %s, %s
            );
        """, (
            usuario_actual["id"],
            f"usuario actualizado: {usuario}",
            json.dumps(usuario_anterior, ensure_ascii=False, default=str),
            json.dumps(datos_nuevos, ensure_ascii=False),
            request.remote_addr,
            request.headers.get("User-Agent")
        ))

        conexion.commit()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "usuario actualizado correctamente.",
            "usuario": datos_nuevos
        }), 200

    except Error as error:
        try:
            conexion.rollback()
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al actualizar el usuario.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al actualizar el usuario.",
            "error": str(error)
        }), 500


# =====================================================
# cambiar estado de usuario
# =====================================================

@app.route("/api/admin/usuarios/<int:usuario_id>/estado", methods=["PUT"])
@token_requerido
@roles_permitidos("administrador")
def cambiar_estado_usuario_admin(usuario_id):
    usuario_actual = request.usuario_actual
    data = request.get_json() or {}

    nuevo_estado = limpiar_texto(data.get("estado"))

    if nuevo_estado not in ["activo", "inactivo"]:
        return jsonify({
            "estado": "error",
            "mensaje": "estado no válido."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                usuario,
                nombres,
                apellidos,
                estado
            from usuarios
            where id = %s
            limit 1;
        """, (usuario_id,))

        usuario_encontrado = cursor.fetchone()

        if usuario_encontrado is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "usuario no encontrado."
            }), 404

        if usuario_encontrado["id"] == usuario_actual["id"] and nuevo_estado == "inactivo":
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no puede desactivar su propio usuario."
            }), 409

        cursor.execute("""
            update usuarios
            set estado = %s
            where id = %s;
        """, (nuevo_estado, usuario_id))

        cursor.execute("""
            insert into auditoria (
                usuario_id,
                solicitud_id,
                modulo,
                accion,
                descripcion,
                datos_anteriores,
                datos_nuevos,
                ip_origen,
                user_agent
            ) values (
                %s, null, 'usuarios', 'cambiar_estado', %s, %s, %s, %s, %s
            );
        """, (
            usuario_actual["id"],
            f"estado de usuario cambiado: {usuario_encontrado['usuario']} -> {nuevo_estado}",
            json.dumps(usuario_encontrado, ensure_ascii=False, default=str),
            json.dumps({
                "id": usuario_id,
                "usuario": usuario_encontrado["usuario"],
                "estado": nuevo_estado
            }, ensure_ascii=False),
            request.remote_addr,
            request.headers.get("User-Agent")
        ))

        conexion.commit()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "estado del usuario actualizado correctamente.",
            "usuario": {
                "id": usuario_id,
                "estado": nuevo_estado
            }
        }), 200

    except Error as error:
        try:
            conexion.rollback()
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al cambiar el estado del usuario.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            cursor.close()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al cambiar el estado del usuario.",
            "error": str(error)
        }), 500
    

# =====================================================
# catálogos públicos: direcciones, áreas, cargos y jefe
# =====================================================

@app.route("/api/public/catalogos/direcciones", methods=["GET"])
def listar_direcciones_publicas():
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                nombre,
                descripcion,
                estado
            from direcciones
            where estado = 'activo'
            order by nombre asc;
        """)

        direcciones = cursor.fetchall()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "direcciones obtenidas correctamente.",
            "total": len(direcciones),
            "direcciones": direcciones
        }), 200

    except Error as error:
        try:
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener las direcciones.",
            "error": str(error)
        }), 500


@app.route("/api/public/catalogos/direcciones/<int:direccion_id>/areas", methods=["GET"])
def listar_areas_por_direccion_publica(direccion_id):
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                direccion_id,
                nombre,
                siglas,
                descripcion,
                estado
            from areas
            where direccion_id = %s
              and estado = 'activo'
            order by nombre asc;
        """, (direccion_id,))

        areas = cursor.fetchall()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "áreas obtenidas correctamente.",
            "direccion_id": direccion_id,
            "total": len(areas),
            "areas": areas
        }), 200

    except Error as error:
        try:
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener las áreas de la dirección.",
            "error": str(error)
        }), 500


@app.route("/api/public/catalogos/areas/<int:area_id>/cargos", methods=["GET"])
def listar_cargos_por_area_publica(area_id):
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                area_id,
                nombre,
                descripcion,
                estado
            from cargos
            where area_id = %s
              and estado = 'activo'
            order by nombre asc;
        """, (area_id,))

        cargos = cursor.fetchall()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "cargos obtenidos correctamente.",
            "area_id": area_id,
            "total": len(cargos),
            "cargos": cargos
        }), 200

    except Error as error:
        try:
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener los cargos del área.",
            "error": str(error)
        }), 500


@app.route("/api/public/catalogos/areas/<int:area_id>/jefe", methods=["GET"])
def obtener_jefe_por_area_publica(area_id):
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                area_id,
                usuario_id,
                nombres,
                apellidos,
                correo,
                cargo,
                tipo_responsable,
                estado
            from area_personal
            where area_id = %s
              and tipo_responsable = 'jefe_area'
              and estado = 'activo'
            order by id asc
            limit 1;
        """, (area_id,))

        jefe = cursor.fetchone()

        cursor.close()
        conexion.close()

        if jefe is None:
            return jsonify({
                "estado": "error",
                "mensaje": "no existe un jefe asignado para esta área.",
                "area_id": area_id,
                "jefe": None
            }), 404

        return jsonify({
            "estado": "ok",
            "mensaje": "jefe asignado obtenido correctamente.",
            "area_id": area_id,
            "jefe": jefe
        }), 200

    except Error as error:
        try:
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener el jefe asignado del área.",
            "error": str(error)
        }), 500
        
@app.route("/api/public/electronico/<codigo_solicitud>/pdf", methods=["GET"])
def descargar_pdf_publico_firmaec(codigo_solicitud):
    codigo_solicitud = limpiar_texto(codigo_solicitud).upper()

    if not codigo_solicitud:
        return jsonify({
            "estado": "error",
            "mensaje": "el código de solicitud es obligatorio."
        }), 400

    if not re.match(r"^INAMHI-WEB-\d{4}-\d{4}$", codigo_solicitud):
        return jsonify({
            "estado": "error",
            "mensaje": "el código de solicitud no tiene un formato válido."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                s.id,
                s.direccion_id,
                s.area_id,
                s.cargo_id,
                s.jefe_asignado_id,
                s.maxima_autoridad_id,
                s.codigo_solicitud,
                s.nombres_completos,
                s.cedula,
                s.correo_institucional,
                s.telefono_ext,
                s.dependencia,
                s.area_unidad,
                s.cargo,
                s.fecha_solicitud,
                s.tipo_usuario,
                s.nombre_usuario_externo,
                s.direccion_ip,
                s.tiempo_vigencia_acceso,
                s.justificacion_necesidad_institucional,
                s.estado,
                s.etapa_actual,
                s.bloqueada,
                s.created_at,
                s.updated_at,

                (
                    select concat(p.nombres, ' ', ifnull(p.apellidos, ''))
                    from area_personal p
                    where p.area_id = s.area_id
                      and p.tipo_responsable = 'jefe_area'
                      and p.estado = 'activo'
                    order by p.id asc
                    limit 1
                ) as nombre_jefe_area,

                (
                    select concat(u.nombres, ' ', ifnull(u.apellidos, ''))
                    from usuarios u
                    inner join roles r on r.id = u.rol_id
                    where r.nombre = 'maxima_autoridad'
                      and u.estado = 'activo'
                    order by u.id asc
                    limit 1
                ) as nombre_maxima_autoridad,

                (
                    select concat(u.nombres, ' ', ifnull(u.apellidos, ''))
                    from usuarios u
                    inner join roles r on r.id = u.rol_id
                    where r.nombre = 'analista_tics'
                      and u.estado = 'activo'
                    order by u.id asc
                    limit 1
                ) as nombre_encargado_tics

            from solicitudes s
            where s.codigo_solicitud = %s
            limit 1;
        """, (codigo_solicitud,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró una solicitud con ese código."
            }), 404

        cursor.execute("""
            select
                numero,
                url_pagina,
                descripcion
            from solicitud_paginas_web
            where solicitud_id = %s
            order by numero asc;
        """, (solicitud["id"],))

        paginas_web = cursor.fetchall()

        cursor.close()
        conexion.close()

        solicitud["modo_pdf"] = "electronico"

        pdf_buffer = generar_pdf_solicitud_a4(
            solicitud,
            paginas_web,
            incluir_seccion_tics=False,
            modo_pdf="electronico"
        )

        respuesta = send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"{codigo_solicitud}.pdf",
            max_age=0
        )

        respuesta.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        respuesta.headers["Pragma"] = "no-cache"
        respuesta.headers["Expires"] = "0"

        return respuesta

    except Error as error:
        print("ERROR MYSQL AL DESCARGAR PDF FIRMAEC:", error)

        try:
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al descargar el formato PDF.",
            "error": str(error)
        }), 500

    except Exception as error:
        print("ERROR GENERAL AL GENERAR PDF FIRMAEC:", error)

        try:
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al generar el PDF para FirmaEC.",
            "error": str(error)
        }), 500
    # =====================================================
# ruta temporal para crear jefes ficticios por área
# eliminar o comentar después de usar
# =====================================================

@app.route("/api/dev/crear-jefes-ficticios", methods=["GET"])
def crear_jefes_ficticios():
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        # =====================================================
        # obtener rol jefe_inmediato
        # =====================================================

        cursor.execute("""
            select id
            from roles
            where nombre = 'jefe_inmediato'
            limit 1;
        """)

        rol_jefe = cursor.fetchone()

        if rol_jefe is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no existe el rol jefe_inmediato en la tabla roles."
            }), 400

        rol_jefe_id = rol_jefe["id"]

        password_temporal = "jefe123"
        password_hash = crear_hash_password(password_temporal)

        jefes = [
            {
                "area_siglas": "TICS",
                "area_nombre": "TECNOLOGÍAS DE LA INFORMACIÓN Y COMUNICACIÓN",
                "usuario": "diego.tics",
                "nombres": "Diego",
                "apellidos": "Ficticio",
                "cedula": "0100000001",
                "correo": "diego.tics@inamhi.gob.ec",
                "cargo": "Jefe de Tecnologías de la Información y Comunicación",
                "dependencia": "DIRECCIÓN ADMINISTRATIVA FINANCIERA"
            },
            {
                "area_siglas": "CONT",
                "area_nombre": "CONTABILIDAD",
                "usuario": "carlos.conta",
                "nombres": "Carlos",
                "apellidos": "Contabilidad",
                "cedula": "0100000002",
                "correo": "carlos.contabilidad@inamhi.gob.ec",
                "cargo": "Jefe de Contabilidad",
                "dependencia": "DIRECCIÓN ADMINISTRATIVA FINANCIERA"
            },
            {
                "area_siglas": "TES",
                "area_nombre": "TESORERÍA",
                "usuario": "ana.tesoreria",
                "nombres": "Ana",
                "apellidos": "Tesorería",
                "cedula": "0100000003",
                "correo": "ana.tesoreria@inamhi.gob.ec",
                "cargo": "Jefe de Tesorería",
                "dependencia": "DIRECCIÓN ADMINISTRATIVA FINANCIERA"
            },
            {
                "area_siglas": "CP",
                "area_nombre": "COMPRAS PÚBLICAS",
                "usuario": "luis.compras",
                "nombres": "Luis",
                "apellidos": "Compras",
                "cedula": "0100000004",
                "correo": "luis.compras@inamhi.gob.ec",
                "cargo": "Jefe de Compras Públicas",
                "dependencia": "DIRECCIÓN ADMINISTRATIVA FINANCIERA"
            }
        ]

        usuarios_creados = []
        usuarios_actualizados = []
        areas_sin_encontrar = []

        for jefe in jefes:
            # =====================================================
            # buscar área
            # =====================================================

            cursor.execute("""
                select id, nombre, siglas
                from areas
                where siglas = %s
                   or nombre = %s
                limit 1;
            """, (
                jefe["area_siglas"],
                jefe["area_nombre"]
            ))

            area = cursor.fetchone()

            if area is None:
                areas_sin_encontrar.append(jefe["area_nombre"])
                continue

            area_id = area["id"]

            # =====================================================
            # crear o actualizar usuario
            # =====================================================

            cursor.execute("""
                select id
                from usuarios
                where usuario = %s
                   or correo = %s
                   or cedula = %s
                limit 1;
            """, (
                jefe["usuario"],
                jefe["correo"],
                jefe["cedula"]
            ))

            usuario_existente = cursor.fetchone()

            if usuario_existente:
                usuario_id = usuario_existente["id"]

                cursor.execute("""
                    update usuarios
                    set
                        rol_id = %s,
                        nombres = %s,
                        apellidos = %s,
                        cedula = %s,
                        correo = %s,
                        usuario = %s,
                        password_hash = %s,
                        cargo = %s,
                        area_unidad = %s,
                        dependencia = %s,
                        telefono_ext = %s,
                        estado = 'activo',
                        updated_at = now()
                    where id = %s;
                """, (
                    rol_jefe_id,
                    jefe["nombres"],
                    jefe["apellidos"],
                    jefe["cedula"],
                    jefe["correo"],
                    jefe["usuario"],
                    password_hash,
                    jefe["cargo"],
                    area["nombre"],
                    jefe["dependencia"],
                    "0999999999",
                    usuario_id
                ))

                usuarios_actualizados.append(jefe["usuario"])

            else:
                cursor.execute("""
                    insert into usuarios (
                        rol_id,
                        nombres,
                        apellidos,
                        cedula,
                        correo,
                        usuario,
                        password_hash,
                        cargo,
                        area_unidad,
                        dependencia,
                        telefono_ext,
                        estado,
                        created_at,
                        updated_at
                    ) values (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        'activo',
                        now(),
                        now()
                    );
                """, (
                    rol_jefe_id,
                    jefe["nombres"],
                    jefe["apellidos"],
                    jefe["cedula"],
                    jefe["correo"],
                    jefe["usuario"],
                    password_hash,
                    jefe["cargo"],
                    area["nombre"],
                    jefe["dependencia"],
                    "0999999999"
                ))

                usuario_id = cursor.lastrowid
                usuarios_creados.append(jefe["usuario"])

            # =====================================================
            # crear o actualizar jefe de área en area_personal
            # =====================================================

            cursor.execute("""
                select id
                from area_personal
                where area_id = %s
                  and tipo_responsable = 'jefe_area'
                limit 1;
            """, (area_id,))

            jefe_area_existente = cursor.fetchone()

            if jefe_area_existente:
                cursor.execute("""
                    update area_personal
                    set
                        usuario_id = %s,
                        nombres = %s,
                        apellidos = %s,
                        correo = %s,
                        cargo = %s,
                        estado = 'activo',
                        updated_at = now()
                    where id = %s;
                """, (
                    usuario_id,
                    jefe["nombres"],
                    jefe["apellidos"],
                    jefe["correo"],
                    jefe["cargo"],
                    jefe_area_existente["id"]
                ))

            else:
                cursor.execute("""
                    insert into area_personal (
                        area_id,
                        usuario_id,
                        nombres,
                        apellidos,
                        correo,
                        cargo,
                        tipo_responsable,
                        estado,
                        created_at,
                        updated_at
                    ) values (
                        %s, %s, %s, %s, %s, %s,
                        'jefe_area',
                        'activo',
                        now(),
                        now()
                    );
                """, (
                    area_id,
                    usuario_id,
                    jefe["nombres"],
                    jefe["apellidos"],
                    jefe["correo"],
                    jefe["cargo"]
                ))

        conexion.commit()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "jefes ficticios creados o actualizados correctamente.",
            "password_temporal": password_temporal,
            "usuarios_creados": usuarios_creados,
            "usuarios_actualizados": usuarios_actualizados,
            "areas_sin_encontrar": areas_sin_encontrar,
            "credenciales": [
                {
                    "usuario": "diego.tics",
                    "password": password_temporal,
                    "area": "TICS"
                },
                {
                    "usuario": "carlos.conta",
                    "password": password_temporal,
                    "area": "CONTABILIDAD"
                },
                {
                    "usuario": "ana.tesoreria",
                    "password": password_temporal,
                    "area": "TESORERÍA"
                },
                {
                    "usuario": "luis.compras",
                    "password": password_temporal,
                    "area": "COMPRAS PÚBLICAS"
                }
            ],
            "advertencia": "esta ruta es temporal. después de usarla, se recomienda comentarla o eliminarla."
        }), 200

    except Error as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        print("ERROR AL CREAR JEFES FICTICIOS:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error al crear jefes ficticios.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        print("ERROR GENERAL AL CREAR JEFES FICTICIOS:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al crear jefes ficticios.",
            "error": str(error)
        }), 500


        # =====================================================
# flujo electrónico público - subir PDF firmado por solicitante
# =====================================================

@app.route("/api/public/electronico/<codigo_solicitud>/subir-firmado", methods=["POST", "OPTIONS"])
def subir_pdf_firmado_publico_firmaec(codigo_solicitud):
    """
    Recibe el PDF firmado electrónicamente por el solicitante.
    Luego envía la solicitud al jefe inmediato asignado al área.
    """

    if request.method == "OPTIONS":
        return jsonify({
            "estado": "ok",
            "mensaje": "preflight correcto."
        }), 200

    codigo_solicitud = limpiar_texto(codigo_solicitud).upper()

    if not codigo_solicitud:
        return jsonify({
            "estado": "error",
            "mensaje": "el código de solicitud es obligatorio."
        }), 400

    if not re.match(r"^INAMHI-WEB-\d{4}-\d{4}$", codigo_solicitud):
        return jsonify({
            "estado": "error",
            "mensaje": "el código de solicitud no tiene un formato válido."
        }), 400

    if "archivo" not in request.files:
        return jsonify({
            "estado": "error",
            "mensaje": "no se recibió ningún archivo PDF firmado."
        }), 400

    archivo = request.files["archivo"]

    if archivo.filename == "":
        return jsonify({
            "estado": "error",
            "mensaje": "el archivo seleccionado no es válido."
        }), 400

    nombre_original = secure_filename(archivo.filename)
    extension = os.path.splitext(nombre_original)[1].lower()

    if extension != ".pdf":
        return jsonify({
            "estado": "error",
            "mensaje": "solo se permite subir archivos PDF."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        # =====================================================
        # buscar solicitud
        # =====================================================

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                nombres_completos,
                correo_institucional,
                estado,
                etapa_actual,
                jefe_asignado_id,
                area_id
            from solicitudes
            where codigo_solicitud = %s
            limit 1;
        """, (codigo_solicitud,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró una solicitud con ese código."
            }), 404

        # =====================================================
        # validar estado actual
        # =====================================================

        if solicitud["estado"] != "pendiente_firma_solicitante":
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "la solicitud no está pendiente de firma del solicitante.",
                "estado_actual": solicitud["estado"],
                "etapa_actual": solicitud["etapa_actual"]
            }), 400

        # =====================================================
        # validar jefe asignado
        # si no tiene jefe_asignado_id, intentar obtenerlo desde area_personal
        # =====================================================

        jefe_asignado_id = solicitud.get("jefe_asignado_id")

        if not jefe_asignado_id:
            cursor.execute("""
                select usuario_id
                from area_personal
                where area_id = %s
                  and tipo_responsable = 'jefe_area'
                  and estado = 'activo'
                  and usuario_id is not null
                order by id asc
                limit 1;
            """, (solicitud["area_id"],))

            jefe_area = cursor.fetchone()

            if jefe_area is None or not jefe_area.get("usuario_id"):
                cursor.close()
                conexion.close()

                return jsonify({
                    "estado": "error",
                    "mensaje": "no existe un usuario jefe asignado para el área de esta solicitud."
                }), 400

            jefe_asignado_id = jefe_area["usuario_id"]

            cursor.execute("""
                update solicitudes
                set
                    jefe_asignado_id = %s,
                    updated_at = now()
                where id = %s;
            """, (
                jefe_asignado_id,
                solicitud["id"]
            ))

        # =====================================================
        # guardar archivo firmado
        # =====================================================

        nombre_archivo = f"{codigo_solicitud}_firmado_solicitante_{uuid.uuid4().hex[:8]}.pdf"
        ruta_absoluta = os.path.join(FIRMADOS_FOLDER, nombre_archivo)

        archivo.save(ruta_absoluta)

        ruta_relativa = os.path.join("uploads", "firmados", nombre_archivo).replace("\\", "/")

        # =====================================================
        # registrar documento
        # =====================================================

        cursor.execute("""
            insert into solicitud_documentos (
                solicitud_id,
                etapa,
                rol_firmante,
                usuario_id,
                tipo_documento,
                nombre_archivo,
                ruta_archivo,
                mime_type,
                firmado,
                firma_validada,
                created_at,
                updated_at
            ) values (
                %s,
                'firma_solicitante',
                'solicitante',
                null,
                'pdf_firmado_electronico',
                %s,
                %s,
                'application/pdf',
                true,
                false,
                now(),
                now()
            );
        """, (
            solicitud["id"],
            nombre_archivo,
            ruta_relativa
        ))

        # =====================================================
        # enviar al jefe inmediato asignado
        # =====================================================

        cursor.execute("""
            update solicitudes
            set
                estado = 'pendiente_jefe_inmediato',
                etapa_actual = 'jefe_inmediato',
                jefe_asignado_id = %s,
                updated_at = now()
            where id = %s;
        """, (
            jefe_asignado_id,
            solicitud["id"]
        ))

        conexion.commit()

        cursor.close()
        conexion.close()

        try:
            registrar_auditoria(
                usuario_id=None,
                solicitud_id=solicitud["id"],
                modulo="firmaec_publico",
                accion="subir_pdf_firmado_solicitante",
                descripcion=f"PDF firmado electrónicamente subido por el solicitante. Solicitud enviada al jefe asignado. Código {codigo_solicitud}.",
                datos_anteriores={
                    "estado": "pendiente_firma_solicitante",
                    "etapa_actual": "firma_solicitante"
                },
                datos_nuevos={
                    "estado": "pendiente_jefe_inmediato",
                    "etapa_actual": "jefe_inmediato",
                    "jefe_asignado_id": jefe_asignado_id,
                    "archivo": nombre_archivo
                }
            )
        except Exception as error_auditoria:
            print("advertencia: no se pudo registrar auditoría de firma solicitante:", error_auditoria)

        return jsonify({
            "estado": "ok",
            "mensaje": "PDF firmado recibido correctamente. La solicitud fue enviada al jefe inmediato asignado.",
            "solicitud": {
                "id": solicitud["id"],
                "codigo_solicitud": codigo_solicitud,
                "estado": "pendiente_jefe_inmediato",
                "etapa_actual": "jefe_inmediato",
                "jefe_asignado_id": jefe_asignado_id
            },
            "documento": {
                "nombre_archivo": nombre_archivo,
                "ruta_archivo": ruta_relativa,
                "tipo_documento": "pdf_firmado_electronico"
            }
        }), 200

    except Error as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        print("ERROR MYSQL AL SUBIR PDF FIRMADO SOLICITANTE:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error al subir el PDF firmado.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        print("ERROR GENERAL AL SUBIR PDF FIRMADO SOLICITANTE:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al subir el PDF firmado.",
            "error": str(error)
        }), 500
    # =====================================================
# flujo electrónico - jefe inmediato sube PDF firmado
# =====================================================

@app.route("/api/solicitudes/<int:solicitud_id>/jefe/subir-firma", methods=["POST", "OPTIONS"])
@token_requerido
@roles_permitidos("jefe_inmediato")
def jefe_subir_pdf_firmado(solicitud_id):
    """
    El jefe inmediato sube el PDF firmado electrónicamente.
    La solicitud pasa a máxima autoridad.
    """

    if request.method == "OPTIONS":
        return jsonify({
            "estado": "ok",
            "mensaje": "preflight correcto."
        }), 200

    usuario_actual = request.usuario_actual
    usuario_id = usuario_actual["id"]

    if "archivo" not in request.files:
        return jsonify({
            "estado": "error",
            "mensaje": "no se recibió ningún archivo PDF firmado."
        }), 400

    archivo = request.files["archivo"]

    if archivo.filename == "":
        return jsonify({
            "estado": "error",
            "mensaje": "el archivo seleccionado no es válido."
        }), 400

    nombre_original = secure_filename(archivo.filename)
    extension = os.path.splitext(nombre_original)[1].lower()

    if extension != ".pdf":
        return jsonify({
            "estado": "error",
            "mensaje": "solo se permite subir archivos PDF."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        # =====================================================
        # validar solicitud asignada al jefe autenticado
        # =====================================================

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                nombres_completos,
                correo_institucional,
                estado,
                etapa_actual,
                jefe_asignado_id,
                area_id
            from solicitudes
            where id = %s
            limit 1;
        """, (solicitud_id,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró la solicitud."
            }), 404

        if solicitud["estado"] != "pendiente_jefe_inmediato" or solicitud["etapa_actual"] != "jefe_inmediato":
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "la solicitud no está pendiente de revisión del jefe inmediato.",
                "estado_actual": solicitud["estado"],
                "etapa_actual": solicitud["etapa_actual"]
            }), 400

        if int(solicitud["jefe_asignado_id"] or 0) != int(usuario_id):
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "esta solicitud no está asignada al jefe autenticado."
            }), 403

        # =====================================================
        # guardar archivo firmado por jefe
        # =====================================================

        codigo_solicitud = solicitud["codigo_solicitud"]

        nombre_archivo = f"{codigo_solicitud}_firmado_jefe_{uuid.uuid4().hex[:8]}.pdf"
        ruta_absoluta = os.path.join(FIRMADOS_FOLDER, nombre_archivo)

        archivo.save(ruta_absoluta)

        ruta_relativa = os.path.join("uploads", "firmados", nombre_archivo).replace("\\", "/")

        # =====================================================
        # registrar documento del jefe
        # =====================================================

        cursor.execute("""
            insert into solicitud_documentos (
                solicitud_id,
                etapa,
                rol_firmante,
                usuario_id,
                tipo_documento,
                nombre_archivo,
                ruta_archivo,
                mime_type,
                firmado,
                firma_validada,
                created_at,
                updated_at
            ) values (
                %s,
                'jefe_inmediato',
                'jefe_inmediato',
                %s,
                'pdf_firmado_electronico',
                %s,
                %s,
                'application/pdf',
                true,
                false,
                now(),
                now()
            );
        """, (
            solicitud_id,
            usuario_id,
            nombre_archivo,
            ruta_relativa
        ))

        # =====================================================
        # enviar a máxima autoridad
        # =====================================================

        cursor.execute("""
            update solicitudes
            set
                estado = 'pendiente_maxima_autoridad',
                etapa_actual = 'maxima_autoridad',
                updated_at = now()
            where id = %s;
        """, (solicitud_id,))

        conexion.commit()

        cursor.close()
        conexion.close()

        try:
            registrar_auditoria(
                usuario_id=usuario_id,
                solicitud_id=solicitud_id,
                modulo="firmaec_jefe",
                accion="subir_pdf_firmado_jefe",
                descripcion=f"Jefe inmediato subió PDF firmado y envió la solicitud {codigo_solicitud} a máxima autoridad.",
                datos_anteriores={
                    "estado": "pendiente_jefe_inmediato",
                    "etapa_actual": "jefe_inmediato"
                },
                datos_nuevos={
                    "estado": "pendiente_maxima_autoridad",
                    "etapa_actual": "maxima_autoridad",
                    "archivo": nombre_archivo
                }
            )
        except Exception as error_auditoria:
            print("advertencia: no se pudo registrar auditoría de firma del jefe:", error_auditoria)

        return jsonify({
            "estado": "ok",
            "mensaje": "PDF firmado por el jefe recibido correctamente. La solicitud fue enviada a máxima autoridad.",
            "solicitud": {
                "id": solicitud_id,
                "codigo_solicitud": codigo_solicitud,
                "estado": "pendiente_maxima_autoridad",
                "etapa_actual": "maxima_autoridad"
            },
            "documento": {
                "nombre_archivo": nombre_archivo,
                "ruta_archivo": ruta_relativa,
                "tipo_documento": "pdf_firmado_electronico"
            }
        }), 200

    except Error as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        print("ERROR MYSQL AL SUBIR PDF FIRMADO POR JEFE:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error al subir el PDF firmado por el jefe.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        print("ERROR GENERAL AL SUBIR PDF FIRMADO POR JEFE:", error)

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al subir el PDF firmado por el jefe.",
            "error": str(error)
        }), 500







# =====================================================
# iniciar servidor
# =====================================================

if __name__ == "__main__":
    IP_RED = "10.0.5.120"

    print("======================================")
    print(" backend inamhi liberación web iniciado correctamente ")
    print("======================================")
    print(f" host backend: 0.0.0.0")
    print(f" puerto backend: {BACKEND_PORT}")
    print("--------------------------------------")
    print(" URLS LOCALES - SOLO EN TU PC")
    print(f" url test local: http://127.0.0.1:{BACKEND_PORT}/api/test")
    print(f" url mysql local: http://127.0.0.1:{BACKEND_PORT}/api/test-db")
    print(f" url reset passwords local: http://127.0.0.1:{BACKEND_PORT}/api/dev/reset-passwords")
    print(f" url registrar solicitud local: http://127.0.0.1:{BACKEND_PORT}/api/public/solicitudes")
    print("--------------------------------------")
    print(" URLS PARA VER DESDE OTRA PC EN LA MISMA RED")
    print(f" url test red: http://{IP_RED}:{BACKEND_PORT}/api/test")
    print(f" url mysql red: http://{IP_RED}:{BACKEND_PORT}/api/test-db")
    print(f" url registrar solicitud red: http://{IP_RED}:{BACKEND_PORT}/api/public/solicitudes")
    print("--------------------------------------")
    print(" FRONTEND ANGULAR")
    print(" frontend local: http://localhost:4300")
    print(f" frontend en red: http://{IP_RED}:4300")
    print("--------------------------------------")
    print(" IMPORTANTE")
    print(" para que otra pc pueda ver el sistema, ejecuta angular así:")
    print(" ng serve --host 0.0.0.0 --port 4300")
    print("--------------------------------------")
    print(" si no abre desde otra pc, habilita firewall para los puertos 4300 y 5050")
    print("======================================")

    app.run(
        host="0.0.0.0",
        port=BACKEND_PORT,
        debug=False
    )