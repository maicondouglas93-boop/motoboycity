import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RainWeatherService } from './rain-weather.service';

@Module({ imports: [ConfigModule], providers: [RainWeatherService], exports: [RainWeatherService] })
export class WeatherModule {}
